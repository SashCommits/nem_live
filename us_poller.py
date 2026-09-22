"""Live ERCOT poller for The PowerSocket, built on gridstatus.

Publishes the same JSON contract poller.py (NEM) uses — a rolling short-
interval store plus a long-run hourly rollup, one JSON pair per region. Here
"region" means an ERCOT settlement hub (see us_fueltech.REGIONS): unlike NEM,
ERCOT has no per-region demand/supply/fuel-mix, only per-hub price, so every
region JSON shares the same demand/supply/series and differs only in price.

    python us_poller.py --once
"""
import argparse
import json
import logging
import os
import time
from datetime import timedelta
from pathlib import Path

import gridstatus
import pandas as pd

from fueltech import FUELS, NEGATIVE
from us_fueltech import FUEL_MIX_COLUMNS, REGIONS

log = logging.getLogger("us-poller")

HUBS = set(REGIONS.values())
FUEL_COLS = list(FUEL_MIX_COLUMNS.values())
BATTERY_COLS = ["Battery (discharging)", "Battery (charging)"]


def market_now() -> pd.Timestamp:
    return pd.Timestamp.now(tz="US/Central")


def atomic_write(path: Path, text: str):
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text)
    os.replace(tmp, path)


# --------------------------------------------------------------------------
# Fetch + normalize one poll's worth of ERCOT data
# --------------------------------------------------------------------------
def round5(index: pd.DatetimeIndex) -> pd.DatetimeIndex:
    """The three source reports don't share an exact publish clock; snap all
    of them onto the same 5-minute grid so joining lines up cleanly."""
    return index.round("5min")


def fetch_snapshot(ercot: "gridstatus.ercot.Ercot") -> pd.DataFrame:
    """One 5-minute-indexed table: demand, supply, per-fuel MW, per-hub price."""
    mix = ercot.get_fuel_mix("today").set_index("Time").rename(columns=FUEL_MIX_COLUMNS)
    mix.index = round5(mix.index)
    battery = mix.pop("Power Storage") if "Power Storage" in mix.columns else None

    out = mix[[c for c in FUEL_COLS if c in mix.columns]].copy()
    if battery is not None:
        # ERCOT's dashboard reports storage as one signed column (positive =
        # discharging to the grid, negative = charging); split it the same
        # way NEM's per-unit battery MW is split into two stacked series.
        out["Battery (discharging)"] = battery.clip(lower=0)
        out["Battery (charging)"] = battery.clip(upper=0)

    fuel_cols_present = [c for c in FUEL_COLS + BATTERY_COLS if c in out.columns]
    out["supply"] = out[fuel_cols_present].sum(axis=1, min_count=1)

    load = ercot.get_load("today").set_index("Time")["Load"].rename("demand")
    load.index = round5(load.index)
    out = out.join(load, how="outer")

    lmp = ercot.get_lmp("today", location_type="Settlement Point")
    lmp = lmp[lmp["Location"].isin(HUBS)]
    if not lmp.empty:
        price = lmp.pivot_table(index="Interval Start", columns="Location", values="LMP", aggfunc="mean")
        price.index = round5(price.index)
        out = out.join(price, how="outer")

    out.index.name = "t"
    return out[~out.index.duplicated(keep="last")].sort_index()


# --------------------------------------------------------------------------
# Rolling store: short 5-min window + long-run hourly rollup, same shape as
# poller.py's Store but simpler, since gridstatus already hands back one
# merged table per poll instead of AEMO's per-file incremental feed.
# --------------------------------------------------------------------------
class Store:
    def __init__(self, root: Path, keep_days: int, hourly_keep_days: int = 400):
        self.root, self.keep = root, timedelta(days=keep_days)
        self.hourly_keep = timedelta(days=hourly_keep_days)
        self.root.mkdir(parents=True, exist_ok=True)
        self.snap = self._read("snapshot")
        self.hourly = self._read("hourly")

    def _read(self, name):
        p = self.root / f"{name}.parquet"
        return pd.read_parquet(p) if p.exists() else pd.DataFrame()

    def add(self, snapshot: pd.DataFrame):
        if snapshot.empty:
            return
        self.snap = pd.concat([self.snap, snapshot]) if not self.snap.empty else snapshot
        self.snap = self.snap[~self.snap.index.duplicated(keep="last")].sort_index()

    def update_hourly(self):
        """Recompute (not append) each run: the newest hour is still filling,
        and mean-resampling only the current 5-min window keeps this cheap."""
        if self.snap.empty:
            return
        new = self.snap.resample("1h").mean()
        self.hourly = pd.concat([self.hourly, new]) if not self.hourly.empty else new
        self.hourly = self.hourly[~self.hourly.index.duplicated(keep="last")].sort_index()

    def save(self):
        if not self.snap.empty:
            cutoff = self.snap.index.max() - self.keep
            self.snap = self.snap[self.snap.index >= cutoff]
            self.snap.to_parquet(self.root / "snapshot.parquet")
        if not self.hourly.empty:
            cutoff = self.hourly.index.max() - self.hourly_keep
            self.hourly = self.hourly[self.hourly.index >= cutoff]
            self.hourly.to_parquet(self.root / "hourly.parquet")


# --------------------------------------------------------------------------
# Build the JSON the widget reads (same shape as poller.py's build_region/build_long)
# --------------------------------------------------------------------------
def build_json(df: pd.DataFrame, hub: str, hours: int, interval_minutes: int) -> dict | None:
    if df.empty:
        return None
    last = df.index.max()
    idx = pd.date_range(last - timedelta(minutes=interval_minutes * (hours * 60 // interval_minutes - 1)),
                         last, freq=f"{interval_minutes}min")
    d = df.reindex(idx)

    fuel_cols = [c for c in FUEL_COLS + BATTERY_COLS if c in d.columns]
    fuels = [f for f in FUELS if f in fuel_cols and d[f].abs().sum(skipna=True) > 0]

    def col(s, nd=0):
        return [None if pd.isna(v) else round(float(v), nd) for v in s]

    return {
        "updated": market_now().strftime("%Y-%m-%d %H:%M"),
        "latest": last.strftime("%Y-%m-%d %H:%M"),
        "interval_minutes": interval_minutes,
        "timezone": "US/Central (market time)",
        "t": [ts.strftime("%Y-%m-%d %H:%M") for ts in idx],
        "fuels": [{"name": f, "color": FUELS[f], "negative": f in NEGATIVE} for f in fuels],
        "series": {f: col(d[f]) for f in fuels},
        "demand": col(d["demand"]) if "demand" in d.columns else [None] * len(idx),
        "supply": col(d["supply"]) if "supply" in d.columns else [None] * len(idx),
        "price": col(d[hub], 2) if hub in d.columns else [None] * len(idx),
    }


def publish(store: Store, out: Path, hours: int, long_days: int, interval_minutes: int = 5):
    out.mkdir(parents=True, exist_ok=True)
    for key, hub in REGIONS.items():
        data = build_json(store.snap, hub, hours, interval_minutes)
        if data:
            atomic_write(out / f"{key}.json", json.dumps(data, separators=(",", ":")))
        long = build_json(store.hourly, hub, long_days * 24, 60)
        if long:
            atomic_write(out / f"{key}-long.json", json.dumps(long, separators=(",", ":")))


# --------------------------------------------------------------------------
# Main loop
# --------------------------------------------------------------------------
def poll_once(ercot, store: Store):
    snapshot = fetch_snapshot(ercot)
    store.add(snapshot)
    store.update_hourly()
    store.save()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="/var/lib/nem-live/ercot", help="store folder")
    ap.add_argument("--out", default="/var/lib/nem-live/public/ercot", help="folder nginx serves")
    ap.add_argument("--keep-days", type=int, default=7)
    ap.add_argument("--publish-hours", type=int, default=168, help="history included in the short JSON")
    ap.add_argument("--long-days", type=int, default=366, help="history included in the hourly JSON")
    ap.add_argument("--hourly-keep-days", type=int, default=400)
    ap.add_argument("--once", action="store_true")
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    ercot = gridstatus.Ercot()
    store = Store(Path(args.data), args.keep_days, args.hourly_keep_days)
    while True:
        started = time.time()
        try:
            poll_once(ercot, store)
            publish(store, Path(args.out), args.publish_hours, args.long_days)
            log.info("Published %s", store.snap.index.max() if not store.snap.empty else "nothing yet")
        except Exception:
            log.exception("Poll failed")
        if args.once:
            break
        now = time.time()
        wait = 300 - (now % 300) + 40
        time.sleep(max(30, wait if now - started < 300 else 30))


if __name__ == "__main__":
    main()
