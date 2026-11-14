# AI-assisted: written with Claude Code (Anthropic). Runs the real two-agent A2A handoff offline and checks the recorded replay.
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

try:
    import a2a  # noqa: F401
    HAVE_A2A = True
except ImportError:
    HAVE_A2A = False


def stable(doc: dict) -> list:
    """The parts of a replay that must not change between runs (task ids and wall-clock time may)."""
    return [(r["case_id"], r["mission"], r["packet"], r["ground_ack"]) for r in doc["runs"]]


@unittest.skipUnless(HAVE_A2A, "a2a-sdk not installed (pip install -r requirements.txt)")
class TestHandoff(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        out = Path(cls.tmp.name) / "replay.json"
        proc = subprocess.run([sys.executable, str(ROOT / "agents" / "handoff.py"), str(out)],
                              capture_output=True, text=True, timeout=120, cwd=ROOT)
        cls.proc = proc
        cls.doc = json.loads(out.read_text()) if out.exists() else None

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_run_succeeds(self):
        self.assertEqual(self.proc.returncode, 0, self.proc.stdout + self.proc.stderr)
        self.assertEqual(self.doc["error"], "")
        self.assertEqual(len(self.doc["runs"]), 30)

    def test_both_agents_spoke_over_a2a(self):
        posts = [e for e in self.doc["exchanges"] if e["dir"] == "request" and e["method"] == "POST"]
        self.assertEqual({e["port_role"] for e in posts}, {"onboard", "ground"})
        self.assertEqual(len(posts), 60)
        cards = [e for e in self.doc["exchanges"] if e["path"].endswith("agent-card.json")]
        self.assertTrue(cards)

    def test_distance_changes_context_not_score(self):
        by = {}
        for r in self.doc["runs"]:
            by.setdefault(r["case_id"], {})[r["mission"]] = r
        for cid, m in by.items():
            totals = {k: v["packet"]["score"]["total"] for k, v in m.items()}
            self.assertEqual(len(set(totals.values())), 1, cid)
            delays = {k: v["ground_ack"]["reply_reaches_crew_at_mission_s"] - v["packet"]["sent_at_mission_s"] for k, v in m.items()}
            self.assertEqual(delays, {"leo": 3.0, "moon": 28.0, "mars": 4800.0})
            self.assertIsNone(m["mars"]["ground_ack"]["ground_decision"])

    def test_committed_replay_matches_a_fresh_run(self):
        committed = json.loads((ROOT / "site" / "replay.json").read_text())
        self.assertEqual(stable(committed), stable(self.doc), "site/replay.json is stale: rerun scripts/reproduce.sh")


if __name__ == "__main__":
    unittest.main()
