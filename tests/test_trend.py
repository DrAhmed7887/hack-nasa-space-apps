# AI-assisted: written with Claude Code (Anthropic). Tests the scan trend (feature A) and that the +4 is derived from the same scan.
from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from vte.score import InputError, score  # noqa: E402
from vte.trend import (FORWARD, LOW, NOT_MEASURED, RETRO, TREND_NOTE, classify, ijv_from_scans, latest_in_flight, scan_state,  # noqa: E402
                       trend_rows)

PRE = {"age": 30, "family_history": "none", "thrombophilia": [], "abo_non_o": False, "hormone": "none"}


def side(v=None, d=None):
    return {"mean_peak_velocity_cm_s": v, "direction": d}


def scan(label, day, in_flight=True, recorded=True, left=None, right=None):
    return {"label": label, "day": day, "in_flight": in_flight, "recorded": recorded,
            "left": left or side(), "right": right or side()}


def series(left, right=None, direction="anterograde"):
    """Baseline normal, then one recorded in-flight scan (L+30) with the given left values; later slots not recorded."""
    r = right or side(22.0, "anterograde")
    return [scan("Baseline", 0, False, True, side(20.0, "anterograde"), side(21.0, "anterograde")),
            scan("L+30 days", 30, True, True, left, r),
            scan("L+60 days", 60, True, False), scan("R-42 days", 138, True, False)]


def stasis_points(scans):
    item = next(i for i in score({"preflight": PRE, "scans": scans})["items"] if i["group"] == "IJV flow")
    return item["points"]


def cases():
    return json.loads((ROOT / "data" / "crew_cases.json").read_text())["cases"]


class TestLabels(unittest.TestCase):
    def test_boundary_10_vs_9_9(self):
        self.assertEqual(classify(side(10.0, "anterograde")), FORWARD)
        self.assertEqual(classify(side(9.9, "anterograde")), LOW)
        self.assertEqual(stasis_points(series(side(10.0, "anterograde"))), 0)
        self.assertEqual(stasis_points(series(side(9.9, "anterograde"))), 4)

    def test_retrograde_at_high_speed_is_plus_4(self):
        s = series(side(35.0, "retrograde"))
        self.assertEqual(classify(s[1]["left"]), RETRO)
        self.assertEqual(stasis_points(s), 4)

    def test_missing_scan_is_not_measured_and_no_plus_4(self):
        s = [scan("Baseline", 0, False, True, side(20.0, "anterograde"), side(20.0, "anterograde")),
             scan("L+30 days", 30, True, False)]
        self.assertEqual([r["left"] for r in trend_rows(s)], [FORWARD, NOT_MEASURED])
        self.assertIsNone(latest_in_flight(s))
        self.assertIsNone(ijv_from_scans(s))
        res = score({"preflight": PRE, "scans": s})
        self.assertEqual(res["inflight_points"], 0)
        self.assertTrue(any("not done yet" in f for f in res["flags"]))

    def test_baseline_is_never_scored(self):
        s = [scan("Baseline", 0, False, True, side(3.0, "anterograde"), side(3.0, "anterograde")), scan("L+30 days", 30, True, False)]
        self.assertEqual(stasis_points(s), 0)

    def test_velocity_and_direction_are_separate(self):
        self.assertEqual(classify(side(None, "anterograde")), FORWARD)  # direction known, velocity not recorded
        self.assertEqual(classify(side(5.0, None)), LOW)
        self.assertEqual(classify(side(None, None)), NOT_MEASURED)

    def test_state_and_note(self):
        st = scan_state(series(side(8.5, "anterograde")))
        self.assertEqual((st["label"], st["left"], st["right"]), ("L+30 days", LOW, FORWARD))
        self.assertEqual(st["note"], TREND_NOTE)
        self.assertEqual(TREND_NOTE, "These observations neither diagnose nor exclude thrombosis.")
        self.assertIn("No in-flight scan", scan_state([])["note"])

    def test_bad_input(self):
        for bad in ([{"recorded": True}], "x", [scan("a", 1, left=side(5, "sideways"))], [scan("a", 1, left=side(-1, "anterograde"))]):
            with self.subTest(bad), self.assertRaises(InputError):
                ijv_from_scans(bad)


class TestScoreAndTrendNeverDisagree(unittest.TestCase):
    def test_every_stock_case(self):
        for c in cases():
            with self.subTest(c["id"]):
                labels = {lab for s in ("left", "right") for lab in [classify(latest_in_flight(c["scans"])[s])]} if latest_in_flight(c["scans"]) else set()
                item = next(i for i in score(c)["items"] if i["group"] == "IJV flow")
                self.assertEqual(item["points"] == 4, bool(labels & {LOW, RETRO}))

    def test_trend_shows_the_latest_scan_that_scored(self):
        c = next(c for c in cases() if c["id"] == "C05")
        rows = trend_rows(c["scans"])
        self.assertEqual([r["left"] for r in rows], [FORWARD, FORWARD, LOW, NOT_MEASURED])
        self.assertEqual(score(c)["inflight_points"], 6)  # +4 stasis, +2 D-dimer

    def test_stock_cases_have_all_four_slots(self):
        for c in cases():
            self.assertEqual([s["label"] for s in c["scans"]], ["Baseline", "L+30 days", "L+60 days", "R-42 days"])


@unittest.skipUnless(shutil.which("node"), "node is not on PATH")
class TestParity(unittest.TestCase):
    def test_js_equals_python(self):
        sets = [c["scans"] for c in cases()] + [
            series(side(10.0, "anterograde")), series(side(9.9, "anterograde")), series(side(35.0, "retrograde")),
            [scan("L+30 days", 30, True, False)], [], series(side(5, "sideways")), "x",
        ]
        with tempfile.TemporaryDirectory() as d:
            f = Path(d) / "in.json"
            f.write_text(json.dumps({"reports": [], "scan_sets": sets}))
            out = subprocess.run(["node", str(ROOT / "scripts" / "parity_v2.mjs"), str(f)], capture_output=True, text=True, check=True, cwd=ROOT)
        got = json.loads(out.stdout)["scan_sets"]
        pre = {"preflight": PRE}
        for s, g in zip(sets, got):
            with self.subTest(str(s)[:60]):
                try:
                    item = next(i for i in score({**pre, "scans": s})["items"] if i["group"] == "IJV flow")
                    want = {"ok": {"rows": trend_rows(s), "state": scan_state(s), "ijv": ijv_from_scans(s), "inflight_item": item}}
                except InputError as e:
                    want = {"error": str(e)}
                self.assertEqual(g, want)


if __name__ == "__main__":
    unittest.main()
