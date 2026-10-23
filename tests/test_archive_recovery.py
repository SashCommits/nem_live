"""NEM Live: archive recovery is source-backed and never interpolates missing prices."""
import csv
import io
import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch
import zipfile

import pandas as pd
import poller


DAY = datetime(2026, 10, 20)
NOW = datetime(2026, 10, 23, 11)
MISSING = DAY + timedelta(hours=15)
REGIONS = poller.REGIONS["nem"]


def nested_zip(prices=None, demands=None):
    prices = prices or {}
    demands = demands or {}
    stream = io.StringIO()
    w = csv.writer(stream, lineterminator="\n")
    w.writerow(["I", "DISPATCH", "PRICE", "1", "SETTLEMENTDATE", "REGIONID", "INTERVENTION", "RRP"])
    for reg, p in prices.items():
        w.writerow(["D", "DISPATCH", "PRICE", "1", "2026/10/20 15:00:00", reg, "0", p])
    w.writerow(["I", "DISPATCH", "REGIONSUM", "1", "SETTLEMENTDATE", "REGIONID",
                "INTERVENTION", "TOTALDEMAND", "DISPATCHABLEGENERATION"])
    for reg, mw in demands.items():
        w.writerow(["D", "DISPATCH", "REGIONSUM", "1", "2026/10/20 15:00:00", reg, "0", mw, 1000])
    inner = io.BytesIO()
    with zipfile.ZipFile(inner, "w", compression=zipfile.ZIP_DEFLATED) as z:
        z.writestr("PUBLIC_DISPATCHIS_202610201500.csv", stream.getvalue())
    outer = io.BytesIO()
    with zipfile.ZipFile(outer, "w", compression=zipfile.ZIP_DEFLATED) as z:
        z.writestr("PUBLIC_DISPATCHIS_202610201500.zip", inner.getvalue())
    return outer.getvalue()


def make_store(root):
    store = poller.Store(root, keep_days=7)
    times = pd.date_range(DAY + timedelta(minutes=5), periods=288, freq="5min")
    # A complete five-region market day with one missing 15:00 row in ALL regions.
    pairs = [(t, reg) for t in times for reg in REGIONS if t != MISSING]
    store.tables["price"] = pd.DataFrame(
        [(t, reg, 50.0) for t, reg in pairs], columns=["SETTLEMENTDATE", "REGIONID", "RRP"])
    store.tables["demand"] = pd.DataFrame(
        [(t, reg, 3000.0, 1000.0) for t, reg in pairs],
        columns=["SETTLEMENTDATE", "REGIONID", "TOTALDEMAND", "DISPATCHABLEGENERATION"])
    return store


class Response:
    def __init__(self, content):
        self.content = content
    def raise_for_status(self):
        pass


class FakeHTTP:
    def __init__(self, raw):
        self.raw = raw
        self.urls = []
    def get(self, url, timeout=120):
        self.urls.append(url)
        return Response(self.raw)


class ArchiveRecoveryTest(unittest.TestCase):
    def test_nested_archive_decodes_exact_non_intervention_values(self):
        raw = nested_zip({"VIC1": -19.99}, {"VIC1": 4747.32})
        out = poller.archived_dispatchis(raw)
        self.assertEqual(float(out["price"]["RRP"].iloc[0]), -19.99)
        self.assertEqual(float(out["demand"]["TOTALDEMAND"].iloc[0]), 4747.32)
        self.assertEqual(out["price"]["SETTLEMENTDATE"].iloc[0], pd.Timestamp(MISSING))

    def test_only_missing_source_rows_are_restored_from_official_archive(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = make_store(Path(tmp))
            self.assertEqual(len(poller.missing_dispatch_keys(store.tables["price"], DAY.date(), "RRP")), 5)
            self.assertEqual(len(poller.missing_dispatch_keys(store.tables["demand"], DAY.date(), "TOTALDEMAND")), 5)
            prices = {reg: -19.99 if reg == "VIC1" else 60.0 for reg in REGIONS}
            demands = {reg: 4747.32 if reg == "VIC1" else 5000.0 for reg in REGIONS}
            http = FakeHTTP(nested_zip(prices, demands))
            with patch.object(poller, "market_now", return_value=NOW):
                poller.restore_archived_dispatch_gaps(http, store)
                poller.restore_archived_dispatch_gaps(http, store)  # complete => no extra download
            self.assertEqual(len(http.urls), 1)
            self.assertIn("PUBLIC_DISPATCHIS_20261020.zip", http.urls[0])
            for kind, field in (("price", "RRP"), ("demand", "TOTALDEMAND")):
                self.assertEqual(len(poller.missing_dispatch_keys(store.tables[kind], DAY.date(), field)), 0)
            vic = store.tables["price"]
            self.assertEqual(float(vic[(vic["SETTLEMENTDATE"] == MISSING) &
                                        (vic["REGIONID"] == "VIC1")]["RRP"].iloc[0]), -19.99)
            self.assertEqual(float(vic[(vic["SETTLEMENTDATE"] == DAY + timedelta(hours=14, minutes=55)) &
                                        (vic["REGIONID"] == "VIC1")]["RRP"].iloc[0]), 50.0)

    def test_no_fabrication_on_partial_official_archive_and_retry_is_throttled(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = make_store(Path(tmp))
            http = FakeHTTP(nested_zip({"VIC1": -19.99}, {"VIC1": 4747.32}))
            with patch.object(poller, "market_now", return_value=NOW):
                poller.restore_archived_dispatch_gaps(http, store)
                poller.restore_archived_dispatch_gaps(http, store)
            self.assertEqual(len(http.urls), 1)
            self.assertEqual(len(poller.missing_dispatch_keys(store.tables["price"],
                                                             DAY.date(), "RRP")), 4)


if __name__ == "__main__":
    unittest.main()
