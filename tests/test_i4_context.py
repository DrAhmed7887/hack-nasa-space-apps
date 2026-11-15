# AI-assisted: written with Claude Code (Anthropic). Checks that the Inspiration4 context data is group-summary only and clearly labelled.
from __future__ import annotations

import csv
import importlib.util
import json
import re
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOC = json.loads((ROOT / "site" / "i4_context.json").read_text())
POINT_KEYS = {"timepoint", "n", "min", "max", "mean"}
PANEL_TEXT = ("Real, de-identified values from the 4 Inspiration4 crew (3-day orbital flight, 2021), shown as group range and mean only. "
              "Blood was drawn before and after flight, not in flight. These values are context: they are not used in the risk score "
              "and say nothing about any individual.")


def load_script():
    spec = importlib.util.spec_from_file_location("i4_summary", ROOT / "data" / "i4_summary.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class TestSummaryFile(unittest.TestCase):
    def test_only_group_statistics_per_point(self):
        for a in DOC["analytes"]:
            self.assertEqual(len(a["points"]), 7, a["id"])
            for p in a["points"]:
                self.assertEqual(set(p), POINT_KEYS, a["id"])
                self.assertLessEqual(p["n"], 4)
                self.assertLessEqual(p["min"], p["mean"])
                self.assertLessEqual(p["mean"], p["max"])

    def test_implausible_platelet_value_is_excluded_and_noted(self):
        # Physician decision (15 Nov): a platelet count below the plausibility floor is a recording error;
        # it is excluded from the summary and the exclusion is stated in the panel note.
        plt = next(a for a in DOC["analytes"] if a["id"] == "platelets")
        l92 = next(p for p in plt["points"] if p["timepoint"] == "L-92")
        self.assertEqual(l92["n"], 3)
        for p in plt["points"]:
            self.assertGreaterEqual(p["min"], 50)
        self.assertIn("excluded", plt["note"].lower())

    def test_no_person_ids_or_per_person_fields_anywhere(self):
        text = (ROOT / "site" / "i4_context.json").read_text()
        self.assertIsNone(re.search(r"\bC00\d\b", text))
        for bad in ("SUBJECT_ID", "subject", "\"ID\"", "\"sex\"", "SEX"):
            self.assertNotIn(bad, text)
        self.assertEqual(set(DOC), {"_ai_assisted", "credit", "what", "timepoints", "studies", "analytes"})

    def test_credit_sources_and_timepoints(self):
        self.assertEqual(DOC["credit"], "Data are courtesy of the NASA Open Science Data Repository (https://osdr.nasa.gov/bio/repo)")
        self.assertEqual(DOC["timepoints"], ["L-92", "L-44", "L-3", "R+1", "R+45", "R+82", "R+194"])
        self.assertEqual({a["id"] for a in DOC["analytes"]}, {"fibrinogen", "pf4", "platelets"})
        for a in DOC["analytes"]:
            self.assertTrue(a["study_url"].startswith("https://osdr.nasa.gov/bio/repo/data/studies/OSD-5"))
            self.assertTrue(a["source_file"].endswith("_SUBMITTED.csv") and a["unit"])
        self.assertIn("_ai_assisted", DOC)

    def test_raw_files_are_not_in_the_repo(self):
        self.assertFalse(list(ROOT.glob("**/*SUBMITTED*")))


class TestSummaryScript(unittest.TestCase):
    def test_script_never_writes_individual_values_or_ids(self):
        mod = load_script()
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            with (d / mod.CV_FILE).open("w", newline="") as fh:
                w = csv.writer(fh)
                w.writerow(["Analyte", "Concentration", "Timepoint", "ID", "Unit"])
                for name in ("Fibrinogen", "PF4"):
                    for tp in mod.TIMEPOINTS:
                        for i, v in enumerate((111.11, 222.22, 333.33, 444.44), 1):
                            w.writerow([name, v, tp, f"C00{i}", "ng/ml"])
            with (d / mod.CBC_FILE).open("w", newline="") as fh:
                w = csv.writer(fh)
                w.writerow(["ANALYTE", "VALUE", "UNITS", "SUBJECT_ID", "SEX", "TEST_DATE"])
                for tp in mod.TIMEPOINTS:
                    for i, v in enumerate((100, 200, 300, 400), 1):
                        w.writerow(["PLATELET COUNT", v, "Thousand/uL", f"C00{i}", "M", tp])
            out = json.dumps(mod.build(d))
        self.assertIsNone(re.search(r"C00\d", out))
        for single in ("111.11", "222.22", "333.33", "444.44"):
            self.assertNotIn(single, out)
        self.assertIn('"mean": 278.0', out)  # the group mean (rounded) is there

    def test_summarise_returns_only_group_stats(self):
        mod = load_script()
        self.assertEqual(mod.summarise([1.0, 2.0, 6.0], 1), {"n": 3, "min": 1.0, "max": 6.0, "mean": 3.0})


class TestPanel(unittest.TestCase):
    def test_panel_text_title_and_unavailable_path(self):
        html = (ROOT / "site" / "index.html").read_text()
        self.assertIn("Real NASA data: Inspiration4 (context only)", html)
        self.assertIn(PANEL_TEXT, html)
        js = (ROOT / "site" / "app.js").read_text()
        self.assertIn("Context data unavailable", js)
        self.assertNotIn("innerHTML", js)

    def test_score_code_does_not_touch_the_context_data(self):
        for f in ("vte/score.py", "vte/trend.py", "vte/symptoms.py", "site/score.js", "site/trend.js", "site/symptoms.js",
                  "site/v3/store.js", "site/v3/timeline.js", "site/v3/states.js", "site/v3/orchestrator.js", "site/v3/meds.js", "site/v3/pipeline.js"):
            self.assertNotIn("i4", (ROOT / f).read_text().lower(), f)


if __name__ == "__main__":
    unittest.main()
