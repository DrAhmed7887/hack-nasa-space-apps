# AI-assisted: written with Claude Code (Anthropic). Expected values were worked out by hand from the NASA table before the first run.
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from vte.missions import review_context  # noqa: E402
from vte.score import InputError, band_for, next_scan, scan_schedule, score  # noqa: E402

# case id -> (preflight points, in-flight points, total, band start)
EXPECTED = {
    "C01": (0, 0, 0, "0 points"),
    "C02": (1, 0, 1, "1 point"),
    "C03": (3, 0, 3, "2-3 points"),
    "C04": (1, 4, 5, "4-6 points"),
    "C05": (3, 6, 9, "> 6 points"),
    "C06": (0, 0, 0, "0 points"),
    "C07": (1, 6, 7, "> 6 points"),
    "C08": (4, 0, 4, "4-6 points"),
    "C09": (10, 0, 10, "> 6 points"),
    "C10": (1, 0, 1, "1 point"),
    "C11": (1, 0, 1, "1 point"),
}


def cases() -> dict:
    doc = json.loads((ROOT / "data" / "crew_cases.json").read_text())
    return {c["id"]: c for c in doc["cases"]}


BOUNDARY_VALUES = {8.5, 9.9, 10.0}  # fixed by design: C05 stasis, C07 just under, C06 exactly on the NASA <10 cm/s line


class TestNasaCalibration(unittest.TestCase):
    def test_normal_flow_values_in_nasa_range(self):
        """Every non-boundary velocity is within NASA's reported no-stasis range, 18-70 cm/s (SP-20260005258 REV1)."""
        seen = 0
        for c in cases().values():
            for sc in c["scans"]:
                for side in ("left", "right"):
                    v = sc[side]["mean_peak_velocity_cm_s"]
                    if v is None or v in BOUNDARY_VALUES:
                        continue
                    seen += 1
                    self.assertTrue(18.0 <= v <= 70.0, (c["id"], sc["label"], side, v))
        self.assertGreater(seen, 30)

    def test_boundary_values_kept(self):
        got = cases()
        latest = lambda cid: next(s for s in reversed(got[cid]["scans"]) if s["recorded"] and s["in_flight"])["left"]["mean_peak_velocity_cm_s"]  # noqa: E731
        self.assertEqual((latest("C05"), latest("C06"), latest("C07")), (8.5, 10.0, 9.9))
        self.assertEqual(got["C06"]["inflight"]["ddimer_now"] / got["C06"]["inflight"]["ddimer_baseline"], 1.6)
        self.assertEqual([got[c]["preflight"]["age"] for c in ("C06", "C07", "C08")], [40, 41, 50])


class TestCases(unittest.TestCase):
    def test_every_case_matches_hand_worked_total(self):
        got = cases()
        self.assertEqual(set(got), set(EXPECTED))
        for cid, (pre, inf, total, band) in EXPECTED.items():
            r = score(got[cid])
            with self.subTest(cid):
                self.assertEqual((r["preflight_points"], r["inflight_points"], r["total"]), (pre, inf, total))
                self.assertTrue(r["nasa_reference_band"].startswith(band), r["nasa_reference_band"])

    def test_deterministic(self):
        c = cases()["C05"]
        self.assertEqual(json.dumps(score(c)), json.dumps(score(c)))

    def test_flags(self):
        got = cases()
        self.assertTrue(any("single +10 row" in f for f in score(got["C09"])["flags"]))
        self.assertTrue(any("pre-flight factors only" in f for f in score(got["C10"])["flags"]))
        self.assertTrue(any("does not routinely test" in f for f in score(got["C01"])["flags"]))


class TestRules(unittest.TestCase):
    def base(self, **pre):
        p = {"age": 30, "family_history": "none", "thrombophilia": [], "abo_non_o": False, "hormone": "none"}
        p.update(pre)
        return {"preflight": p, "inflight": {"ijv": {"left": {"mean_peak_velocity_cm_s": 20, "retrograde": False}}}}

    def test_bands_verbatim(self):
        self.assertEqual(band_for(1), "1 point = no additional action")
        self.assertEqual(band_for(3), "2-3 points = increased monitoring")
        self.assertEqual(band_for(6), "4-6 points = prophylactic apixaban")
        self.assertEqual(band_for(7), "> 6 points = need clinical assessment")

    def test_age_edges(self):
        self.assertEqual(score(self.base(age=40))["total"], 0)
        self.assertEqual(score(self.base(age=50))["total"], 1)
        self.assertEqual(score(self.base(age=51))["total"], 2)

    def test_two_non_fvl_thrombophilias_flagged(self):
        r = score(self.base(thrombophilia=["protein_c", "protein_s"]))
        self.assertEqual(r["total"], 6)
        self.assertTrue(any("does not say how to combine" in f for f in r["flags"]))

    def test_right_side_stasis_counts_once(self):
        c = self.base()
        c["inflight"]["ijv"] = {"left": {"mean_peak_velocity_cm_s": 5, "retrograde": True},
                                "right": {"mean_peak_velocity_cm_s": 3, "retrograde": False}}
        self.assertEqual(score(c)["inflight_points"], 4)

    def test_bad_input_rejected(self):
        bad = [self.base(age="old"), self.base(age=float("nan")), self.base(age=5), self.base(hormone="x"),
               self.base(thrombophilia=["fvl_het", "fvl_hom"]), self.base(thrombophilia="fvl_het"),
               self.base(abo_non_o="yes"), {"preflight": None}, []]
        for b in bad:
            with self.subTest(b=str(b)[:60]), self.assertRaises(InputError):
                score(b)
        c = self.base()
        c["inflight"]["ijv"] = {"left": {"mean_peak_velocity_cm_s": -1}}
        with self.assertRaises(InputError):
            score(c)


class TestScheduleAndMission(unittest.TestCase):
    def test_180_day_schedule_matches_mtb007(self):
        self.assertEqual([r["label"] for r in scan_schedule(180)], ["L+30 days", "L+60 days", "R-42 days"])
        self.assertEqual(next_scan(180, 20)["day"], 30)
        self.assertEqual(next_scan(180, 61)["day"], 138)

    def test_mission_changes_context_not_score(self):
        self.assertEqual(review_context("mars")["earliest_ground_reply_s"], 4800)
        self.assertEqual(review_context("leo")["earliest_ground_reply_s"], 3)
        with self.assertRaises(ValueError):
            review_context("venus")


if __name__ == "__main__":
    unittest.main()
