# AI-assisted: written with Claude Code (Anthropic). Checks that site/score.js gives the same results as vte/score.py.
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

from vte.missions import MISSIONS, review_context  # noqa: E402
from vte.score import InputError, score, scan_schedule, next_scan  # noqa: E402
from vte.sources import SOURCES  # noqa: E402

PRE = {"age": 30, "family_history": "none", "thrombophilia": [], "abo_non_o": False, "hormone": "none"}
SCAN = {"left": {"mean_peak_velocity_cm_s": 20, "retrograde": False}}


def case(cid, pre=None, inflight=None, **extra):
    c = {"id": cid, "preflight": {**PRE, **(pre or {})}, "inflight": inflight if inflight is not None else {"ijv": SCAN}}
    c.update(extra)
    return c


EDGES = [
    case("age40", {"age": 40}),
    case("age41", {"age": 41}),
    case("age50", {"age": 50}),
    case("age51", {"age": 51}),
    case("pc_ps", {"thrombophilia": ["protein_c", "protein_s"]}),
    case("fvl_other", {"thrombophilia": ["fvl_het", "at3"]}),
    case("fvl_hom_only", {"thrombophilia": ["fvl_hom"]}),
    case("dup_codes", {"thrombophilia": ["at3", "at3", "prothrombin_het"]}),
    case("hormone_some", {"hormone": "some", "abo_non_o": True, "family_history": "two_plus"}),
    case("stasis_exact_10", inflight={"ijv": {"left": {"mean_peak_velocity_cm_s": 10, "retrograde": False}}}),
    case("stasis_9_95", inflight={"ijv": {"right": {"mean_peak_velocity_cm_s": 9.95, "retrograde": False}}}),
    case("retro_both", inflight={"ijv": {"left": {"mean_peak_velocity_cm_s": 5, "retrograde": True},
                                          "right": {"mean_peak_velocity_cm_s": 3.25, "retrograde": False}}}),
    case("no_velocity", inflight={"ijv": {"left": {"mean_peak_velocity_cm_s": None, "retrograde": False}}}),
    case("no_scan", inflight={}),
    case("dd_exact_60", inflight={"ijv": SCAN, "ddimer_baseline": 200, "ddimer_now": 320}),
    case("dd_60_5", inflight={"ijv": SCAN, "ddimer_baseline": 200, "ddimer_now": 321}),
    case("dd_fall", inflight={"ijv": SCAN, "ddimer_baseline": 333, "ddimer_now": 331}),
    case("dd_third", inflight={"ijv": SCAN, "ddimer_baseline": 3, "ddimer_now": 4.1}),
    case("sched_short", mission_days=45, inflight={"ijv": SCAN, "mission_day": 10}),
    case("sched_90", mission_days=90, inflight={"ijv": SCAN, "mission_day": 31}),
    case("sched_100", mission_days=100, inflight={"ijv": SCAN, "mission_day": 61}),
    case("sched_past_end", mission_days=180, inflight={"ijv": SCAN, "mission_day": 170}),
    # inputs that must be rejected, with the same message
    case("bad_age_low", {"age": 17}),
    case("bad_age_high", {"age": 91}),
    case("bad_age_str", {"age": "40"}),
    case("bad_age_bool", {"age": True}),
    case("bad_age_none", {"age": None}),
    case("bad_family", {"family_history": "three"}),
    case("bad_thrombo_code", {"thrombophilia": ["nope"]}),
    case("bad_thrombo_type", {"thrombophilia": "at3"}),
    case("bad_fvl_both", {"thrombophilia": ["fvl_het", "fvl_hom"]}),
    case("bad_abo", {"abo_non_o": "yes"}),
    case("bad_hormone", {"hormone": "lots"}),
    case("bad_ijv_side", inflight={"ijv": {"middle": {}}}),
    case("bad_ijv_empty", inflight={"ijv": {}}),
    case("bad_ijv_retro", inflight={"ijv": {"left": {"mean_peak_velocity_cm_s": 20, "retrograde": 1}}}),
    case("bad_velocity", inflight={"ijv": {"left": {"mean_peak_velocity_cm_s": 250, "retrograde": False}}}),
    case("bad_dd_base_zero", inflight={"ijv": SCAN, "ddimer_baseline": 0, "ddimer_now": 5}),
    case("bad_dd_now_neg", inflight={"ijv": SCAN, "ddimer_baseline": 5, "ddimer_now": -1}),
    {"id": "bad_no_preflight"},
    {"id": "bad_preflight_type", "preflight": []},
]


def run_node(cases):
    with tempfile.TemporaryDirectory() as d:
        f = Path(d) / "cases.json"
        f.write_text(json.dumps(cases))
        out = subprocess.run(["node", str(ROOT / "scripts" / "parity.mjs"), str(f)], capture_output=True, text=True, check=True, cwd=ROOT)
    return json.loads(out.stdout)


def py_expected(c):
    try:
        out = {"id": c.get("id"), "result": score(c)}
        md = c.get("mission_days")
        if isinstance(md, int):
            out["schedule"] = scan_schedule(md)
            out["next_scan"] = next_scan(md, (c.get("inflight") or {}).get("mission_day", 0))
        return out
    except InputError as e:
        return {"id": c.get("id"), "error": str(e)}


@unittest.skipUnless(shutil.which("node"), "node is not on PATH")
class TestParity(unittest.TestCase):
    def check(self, cases):
        js = run_node(cases)["results"]
        self.assertEqual(len(js), len(cases))
        for c, got in zip(cases, js):
            want = py_expected(c)
            with self.subTest(c.get("id")):
                self.assertEqual(("error" in got), ("error" in want), (got, want))
                if "error" in want:
                    self.assertEqual(got["error"], want["error"])
                    continue
                g, w = got["result"], want["result"]
                self.assertEqual([(i["group"], i["rule"], i["points"]) for i in g["items"]],
                                 [(i["group"], i["rule"], i["points"]) for i in w["items"]])
                self.assertEqual([i["value"] for i in g["items"]], [i["value"] for i in w["items"]])
                self.assertEqual((g["preflight_points"], g["inflight_points"], g["total"]),
                                 (w["preflight_points"], w["inflight_points"], w["total"]))
                self.assertEqual(g["nasa_reference_band"], w["nasa_reference_band"])
                self.assertEqual(g["flags"], w["flags"])
                self.assertEqual(g, w)  # everything else too: note, source, case_id
                self.assertEqual(got.get("schedule"), want.get("schedule"))
                self.assertEqual(got.get("next_scan"), want.get("next_scan"))

    def test_stock_cases(self):
        doc = json.loads((ROOT / "data" / "crew_cases.json").read_text())
        self.check(doc["cases"])

    def test_edge_inputs(self):
        self.check(EDGES)

    def test_sources_and_missions(self):
        out = run_node([])
        self.assertEqual(out["sources"], SOURCES)
        self.assertEqual(out["contexts"], {m: review_context(m) for m in MISSIONS})


if __name__ == "__main__":
    unittest.main()
