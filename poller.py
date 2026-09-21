"""Live NEM poller for The PowerSocket.

Every 5 minutes it pulls the newest files from NEMWeb's "Current" reports
(unit SCADA, dispatch price/demand, rooftop PV), keeps a rolling store on disk,
and writes one small JSON file per region for the website widget to read.

    python poller.py                 # run forever
    python poller.py --once          # single pass (for testing or cron)
"""
import argparse
import csv
import io
import json
import logging
import os
import re
import time
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urljoin

import pandas as pd
import requests
from requests.adapters import HTTPAdapter, Retry

from fueltech import FUELS, NEGATIVE, classify

log = logging.getLogger("nem-live")

BASE = "https://nemweb.com.au"
SOURCES = {
    "scada": ("/Reports/Current/Dispatch_SCADA/", "PUBLIC_DISPATCHSCADA_"),
    "dispatchis": ("/Reports/Current/DispatchIS_Reports/", "PUBLIC_DISPATCHIS_"),
    "rooftop": ("/Reports/Current/ROOFTOP_PV/ACTUAL/", "PUBLIC_ROOFTOP_PV_ACTUAL_MEASUREMENT_"),
}
KEYS = {
    "scada": ["SETTLEMENTDATE", "DUID"],
    "price": ["SETTLEMENTDATE", "REGIONID"],
    "demand": ["SETTLEMENTDATE", "REGIONID"],
    "rooftop": ["INTERVAL_DATETIME", "REGIONID"],
}
TIMECOL = {"scada": "SETTLEMENTDATE", "price": "SETTLEMENTDATE", "demand": "SETTLEMENTDATE", "rooftop": "INTERVAL_DATETIME"}
REGIONS = {"nem": ["NSW1", "QLD1", "VIC1", "SA1", "TAS1"], "nsw1": ["NSW1"], "qld1": ["QLD1"],
           "vic1": ["VIC1"], "sa1": ["SA1"], "tas1": ["TAS1"]}
AEMO_TIME = "%Y/%m/%d %H:%M:%S"


def market_now() -> datetime:
    """NEM market time is AEST (UTC+10) all year, whatever the server clock is set to."""
    return datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=10)


# --------------------------------------------------------------------------
# NEMWeb access
# --------------------------------------------------------------------------
def session() -> requests.Session:
    s = requests.Session()
    s.headers["User-Agent"] = "Mozilla/5.0 (PowerSocket NEM live poller)"
    s.mount("https://", HTTPAdapter(max_retries=Retry(total=4, backoff_factor=2, status_forcelist=[429, 500, 502, 503, 504])))
    return s


def list_files(http, folder: str, prefix: str) -> list[tuple[datetime, str]]:
    html = http.get(urljoin(BASE, folder), timeout=30).text
    out = []
    for href in re.findall(r'href="([^"]+?\.zip)"', html, flags=re.I):
        name = href.rsplit("/", 1)[-1]
        if not name.upper().startswith(prefix):
            continue
        m = re.search(r"_(\d{12})", name)
        if m:
            out.append((datetime.strptime(m.group(1), "%Y%m%d%H%M"), urljoin(BASE, href)))
    return sorted(out)


def parse_aemo(raw: bytes) -> dict[tuple[str, str], pd.DataFrame]:
    """Parse AEMO's multi-table CSV format (C/I/D rows) inside a zip."""
    tables, headers = {}, {}
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        for member in z.namelist():
            if not member.lower().endswith(".csv"):
                continue
            text = z.read(member).decode("utf-8", errors="replace")
            for row in csv.reader(io.StringIO(text)):
                if len(row) < 4:
                    continue
                key = (row[1].upper(), row[2].upper())
                if row[0] == "I":
                    headers[key] = row[4:]
                    tables.setdefault(key, [])
                elif row[0] == "D" and key in headers:
                    tables[key].append(row[4:4 + len(headers[key])])
    return {k: pd.DataFrame(v, columns=headers[k]) for k, v in tables.items() if v}


def extract(kind: str, raw: bytes) -> dict[str, pd.DataFrame]:
    t = parse_aemo(raw)
    out = {}
    if kind == "scada" and ("DISPATCH", "UNIT_SCADA") in t:
        out["scada"] = t[("DISPATCH", "UNIT_SCADA")][["SETTLEMENTDATE", "DUID", "SCADAVALUE"]]
    if kind == "dispatchis":
        for key, name, col in [(("DISPATCH", "PRICE"), "price", "RRP"), (("DISPATCH", "REGIONSUM"), "demand", "TOTALDEMAND")]:
            if key in t:
                df = t[key]
                df = df[pd.to_numeric(df["INTERVENTION"], errors="coerce").fillna(0) == 0]
                out[name] = df[["SETTLEMENTDATE", "REGIONID", col]]
    if kind == "rooftop" and ("ROOFTOP", "ACTUAL") in t:
        df = t[("ROOFTOP", "ACTUAL")]
        out["rooftop"] = df[["INTERVAL_DATETIME", "REGIONID", "POWER"]]
    for name, df in out.items():
        df = df.copy()
        df[TIMECOL[name]] = pd.to_datetime(df[TIMECOL[name]], format=AEMO_TIME)
        for c in df.columns:
            if c not in KEYS[name]:
                df[c] = pd.to_numeric(df[c], errors="coerce")
        out[name] = df
    return out


# --------------------------------------------------------------------------
# Rolling store
# --------------------------------------------------------------------------
class Store:
    def __init__(self, root: Path, keep_days: int):
        self.root, self.keep = root, timedelta(days=keep_days)
        self.root.mkdir(parents=True, exist_ok=True)
        self.tables = {n: self._read(n) for n in KEYS}
        state = root / "state.json"
        self.seen = set(json.loads(state.read_text())) if state.exists() else set()

    def _read(self, name):
        p = self.root / f"{name}.parquet"
        return pd.read_parquet(p) if p.exists() else pd.DataFrame()

    def add(self, name, df):
        cur = self.tables[name]
        self.tables[name] = pd.concat([cur, df]).drop_duplicates(KEYS[name], keep="last")

    def save(self):
        for name, df in self.tables.items():
            if df.empty:
                continue
            cutoff = df[TIMECOL[name]].max() - self.keep
            df = df[df[TIMECOL[name]] >= cutoff].reset_index(drop=True)
            self.tables[name] = df
            df.to_parquet(self.root / f"{name}.parquet", index=False)
        # Only remember files still inside NEMWeb's ~2-day Current window.
        cutoff = (market_now() - timedelta(days=3)).strftime("%Y%m%d%H%M")
        self.seen = {f for f in self.seen if (m := re.search(r"_(\d{12})", f)) and m.group(1) >= cutoff}
        atomic_write(self.root / "state.json", json.dumps(sorted(self.seen)))


def atomic_write(path: Path, text: str):
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text)
    os.replace(tmp, path)


# --------------------------------------------------------------------------
# Registry (DUID -> fuel), refreshed daily via NEMOSIS
# --------------------------------------------------------------------------
def load_registry(root: Path) -> pd.DataFrame:
    path = root / "registry.parquet"
    stamp = root / "registry_updated.txt"  # file mtimes don't survive a git checkout
    fresh = path.exists() and stamp.exists() and time.time() - float(stamp.read_text() or 0) < 86400
    if not fresh:
        try:
            from nemosis import static_table
            cache = root / "nemosis_cache"
            cache.mkdir(exist_ok=True)
            df = static_table("Generators and Scheduled Loads", str(cache), update_static_file=True)
            df.columns = [c.strip() for c in df.columns]
            df = df.drop_duplicates("DUID").copy()
            dtype = df["Dispatch Type"].astype(str).str.lower()
            df["is_load"] = dtype.str.contains("load") & ~dtype.str.contains("bidirectional")
            df["fuel"] = df.apply(classify, axis=1)
            df[["DUID", "Region", "fuel", "is_load"]].to_parquet(path, index=False)
            stamp.write_text(str(time.time()))
            log.info("Registry refreshed: %d units", len(df))
        except Exception as exc:
            if not path.exists():
                raise
            log.warning("Registry refresh failed, using previous copy: %s", exc)
    return pd.read_parquet(path)


# --------------------------------------------------------------------------
# Build the JSON the widget reads
# --------------------------------------------------------------------------
def build_region(tables, registry, regions, hours) -> dict | None:
    scada, price, demand = tables["scada"], tables["price"], tables["demand"]
    if scada.empty or price.empty:
        return None

    u = scada.merge(registry, on="DUID", how="inner")
    u = u[u["Region"].isin(regions) & u["fuel"].notna()].copy()
    u["MW"] = u["SCADAVALUE"].where(~u["is_load"], -u["SCADAVALUE"].abs())
    bat = u["fuel"] == "Battery"
    u.loc[bat & (u["MW"] >= 0), "fuel"] = "Battery (discharging)"
    u.loc[bat & (u["MW"] < 0), "fuel"] = "Battery (charging)"
    gen = ~u["fuel"].isin(NEGATIVE)
    u.loc[gen, "MW"] = u.loc[gen, "MW"].clip(lower=0)
    stack = u.pivot_table(index="SETTLEMENTDATE", columns="fuel", values="MW", aggfunc="sum")

    p = price[price["REGIONID"].isin(regions)].merge(demand, on=["SETTLEMENTDATE", "REGIONID"])
    p["w"] = p["RRP"] * p["TOTALDEMAND"]
    m = p.groupby("SETTLEMENTDATE").agg(w=("w", "sum"), demand=("TOTALDEMAND", "sum"))
    m["price"] = m["w"] / m["demand"]

    if stack.empty or m.empty:
        return None
    last = min(stack.index.max(), m.index.max())
    idx = pd.date_range(last - timedelta(hours=hours) + timedelta(minutes=5), last, freq="5min")
    stack, m = stack.reindex(idx), m.reindex(idx)

    rt = tables["rooftop"]
    if not rt.empty:
        r = rt[rt["REGIONID"].isin(regions)].groupby("INTERVAL_DATETIME")["POWER"].sum().sort_index()
        # Half-hourly and interval-ending; rooftop lags ~30 min, so carry the last value up to an hour.
        r = r.reindex(idx.union(r.index)).bfill(limit=5).ffill(limit=12).reindex(idx)
        stack["Solar (rooftop)"] = r

    fuels = [f for f in FUELS if f in stack.columns and stack[f].abs().sum() > 0]

    def col(s, nd=0):
        return [None if pd.isna(v) else round(float(v), nd) for v in s]

    return {
        "updated": market_now().strftime("%Y-%m-%d %H:%M"),
        "latest": last.strftime("%Y-%m-%d %H:%M"),
        "interval_minutes": 5,
        "timezone": "AEST (market time)",
        "t": [ts.strftime("%Y-%m-%d %H:%M") for ts in idx],
        "fuels": [{"name": f, "color": FUELS[f], "negative": f in NEGATIVE} for f in fuels],
        "series": {f: col(stack[f]) for f in fuels},
        "demand": col(m["demand"]),
        "price": col(m["price"], 2),
    }


def publish(tables, registry, out: Path, hours: int):
    out.mkdir(parents=True, exist_ok=True)
    for key, regs in REGIONS.items():
        data = build_region(tables, registry, regs, hours)
        if data:
            atomic_write(out / f"{key}.json", json.dumps(data, separators=(",", ":")))


# --------------------------------------------------------------------------
# Main loop
# --------------------------------------------------------------------------
def poll_once(http, store: Store, backfill: timedelta):
    since = market_now() - backfill
    for kind, (folder, prefix) in SOURCES.items():
        try:
            files = list_files(http, folder, prefix)
        except Exception as exc:
            log.warning("Couldn't list %s: %s", folder, exc)
            continue
        new = [(ts, url) for ts, url in files if ts >= since and url.rsplit("/", 1)[-1] not in store.seen]
        log.info("%s: %d new files", kind, len(new))
        for _, url in new:
            try:
                raw = http.get(url, timeout=60).content
                for name, df in extract(kind, raw).items():
                    store.add(name, df)
                store.seen.add(url.rsplit("/", 1)[-1])
            except Exception as exc:
                log.warning("Skipped %s: %s", url, exc)
    store.save()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="/var/lib/nem-live", help="store folder")
    ap.add_argument("--out", default="/var/lib/nem-live/public", help="folder nginx serves as /nem/")
    ap.add_argument("--keep-days", type=int, default=7)
    ap.add_argument("--publish-hours", type=int, default=168, help="history included in the JSON")
    ap.add_argument("--backfill-hours", type=int, default=48)
    ap.add_argument("--once", action="store_true")
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    http = session()
    store = Store(Path(args.data), args.keep_days)
    while True:
        started = time.time()
        try:
            poll_once(http, store, timedelta(hours=args.backfill_hours))
            registry = load_registry(Path(args.data))
            publish(store.tables, registry, Path(args.out), args.publish_hours)
            log.info("Published %s", store.tables["price"]["SETTLEMENTDATE"].max() if not store.tables["price"].empty else "nothing yet")
        except Exception:
            log.exception("Poll failed")
        if args.once:
            break
        # AEMO publishes shortly after each 5-minute boundary; poll ~40s after.
        now = time.time()
        wait = 300 - (now % 300) + 40
        time.sleep(max(30, wait if now - started < 300 else 30))


if __name__ == "__main__":
    main()
