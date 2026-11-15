# AI-assisted: written with Claude Code (Anthropic). Tests the signed symptom-report rule (feature B), Python and JS.
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
from vte.symptoms import (EMERGENCY_MESSAGE, NONE_MESSAGE, NOT_DONE_MESSAGE, REPORT_MESSAGE, SYMPTOMS, assess, empty_report)  # noqa: E402

EMERGENCY_IDS = {"vision_change", "pupil_larger", "hearing_change", "face_drooping", "weak_grip", "speech_trouble", "confusion"}
OTHER_IDS = {"neck_swelling", "headache", "puffy_face"}


def rep(*ticked, severe=False, done=False):
    return {"ticked": list(ticked), "sudden_or_severe": severe, "checklist_done": done}


def cases():
    return {c["id"]: c for c in json.loads((ROOT / "data" / "crew_cases.json").read_text())["cases"]}


class TestRule(unittest.TestCase):
    def test_tags(self):
        self.assertEqual({s["id"] for s in SYMPTOMS if s["emergency"]}, EMERGENCY_IDS)
        self.assertEqual({s["id"] for s in SYMPTOMS if not s["emergency"]}, OTHER_IDS)
        self.assertEqual(len(SYMPTOMS), 10)

    def test_each_emergency_symptom_alone(self):
        for sid in EMERGENCY_IDS:
            with self.subTest(sid):
                r = assess(rep(sid))
                self.assertEqual((r["level"], r["message"]), ("emergency", EMERGENCY_MESSAGE))

    def test_each_other_symptom_alone_is_report_today(self):
        for sid in OTHER_IDS:
            with self.subTest(sid):
                r = assess(rep(sid))
                self.assertEqual((r["level"], r["message"]), ("report_today", REPORT_MESSAGE))

    def test_sudden_or_severe_escalates_any_symptom_and_even_none(self):
        self.assertEqual(assess(rep("headache", severe=True))["level"], "emergency")
        self.assertEqual(assess(rep(severe=True))["level"], "emergency")

    def test_none_ticked(self):
        self.assertEqual(assess(rep(done=True)), {**assess(rep(done=True)), "level": "none_reported", "message": NONE_MESSAGE})
        self.assertEqual(assess(rep())["message"], NOT_DONE_MESSAGE)
        self.assertEqual(assess(None)["level"], "not_done")
        self.assertEqual(assess(empty_report())["level"], "not_done")

    def test_no_all_clear_wording_anywhere(self):
        for msg in (EMERGENCY_MESSAGE, REPORT_MESSAGE, NONE_MESSAGE, NOT_DONE_MESSAGE):
            self.assertNotRegex(msg.lower(), r"all clear|safe|normal|healthy")
        self.assertIn("does not exclude thrombosis", NONE_MESSAGE)

    def test_bad_input(self):
        for bad in ({"ticked": ["nope"]}, {"ticked": "headache"}, {"sudden_or_severe": "yes"}, {"checklist_done": 1}, [], "x"):
            with self.subTest(bad), self.assertRaises(InputError):
                assess(bad)

    def test_duplicates_and_order_are_normalised(self):
        self.assertEqual(assess(rep("headache", "neck_swelling", "headache"))["ticked"], ["neck_swelling", "headache"])


class TestSeparateFromScore(unittest.TestCase):
    def test_symptoms_add_no_points(self):
        base = cases()["C11"]
        bare = {k: v for k, v in base.items() if k != "symptoms"}
        for report in (rep(), rep("vision_change"), rep(*EMERGENCY_IDS, *OTHER_IDS, severe=True, done=True)):
            self.assertEqual(score({**base, "symptoms": report}), score(bare))

    def test_low_score_with_serious_symptom_demo_case(self):
        c = cases()["C11"]
        s = score(c)
        self.assertEqual(s["total"], 1)
        self.assertEqual(s["nasa_reference_band"], "1 point = no additional action")
        a = assess(c["symptoms"])
        self.assertEqual(a["level"], "emergency")
        self.assertEqual(a["adds_points"], 0)

    def test_reset_clears_previous_case(self):
        data = cases()
        shown = assess(data["C11"]["symptoms"])
        self.assertEqual(shown["level"], "emergency")
        after = assess(data["C01"]["symptoms"])  # selecting another case replaces the whole report
        self.assertEqual((after["ticked"], after["level"]), ([], "none_reported"))
        self.assertEqual(assess(empty_report())["ticked"], [])


REPORTS = [rep(), rep(done=True), rep("headache"), rep("neck_swelling", "puffy_face", done=True), rep("confusion"), rep(severe=True),
           rep("headache", severe=True, done=True), *(rep(s["id"]) for s in SYMPTOMS), rep(*EMERGENCY_IDS),
           {"ticked": ["nope"]}, {"ticked": "x"}, {"sudden_or_severe": "yes"}, {"checklist_done": 1}, {}]


@unittest.skipUnless(shutil.which("node"), "node is not on PATH")
class TestParity(unittest.TestCase):
    def test_js_equals_python(self):
        with tempfile.TemporaryDirectory() as d:
            f = Path(d) / "in.json"
            f.write_text(json.dumps({"reports": REPORTS, "scan_sets": []}))
            out = subprocess.run(["node", str(ROOT / "scripts" / "parity_v2.mjs"), str(f)], capture_output=True, text=True, check=True, cwd=ROOT)
        js = json.loads(out.stdout)
        self.assertEqual(js["symptoms"], list(SYMPTOMS))
        for r, got in zip(REPORTS, js["reports"]):
            with self.subTest(r):
                try:
                    self.assertEqual(got, {"ok": assess(r)})
                except InputError as e:
                    self.assertEqual(got, {"error": str(e)})


if __name__ == "__main__":
    unittest.main()
