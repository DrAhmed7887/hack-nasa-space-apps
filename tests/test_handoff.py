# AI-assisted: written with Claude Code (Anthropic). Runs the real two-agent A2A handoff offline and checks the recorded replay.
from __future__ import annotations

import asyncio
import json
import socket
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

sys.path.insert(0, str(ROOT))
from vte.packet import PACKET_PARTS, build_packet  # noqa: E402
from vte.symptoms import EMERGENCY_MESSAGE  # noqa: E402

try:
    import a2a  # noqa: F401
    HAVE_A2A = True
except ImportError:
    HAVE_A2A = False


def free_closed_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


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
        self.assertEqual(len(self.doc["runs"]), 33)

    def test_both_agents_spoke_over_a2a(self):
        posts = [e for e in self.doc["exchanges"] if e["dir"] == "request" and e["method"] == "POST"]
        self.assertEqual({e["port_role"] for e in posts}, {"onboard", "ground"})
        self.assertEqual(len(posts), 66)
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

    def test_packet_carries_score_sources_scan_symptoms_and_message(self):
        for r in self.doc["runs"]:
            p = r["packet"]
            self.assertEqual(set(PACKET_PARTS) - set(p), set(), r["case_id"])
            self.assertEqual(r["ground_ack"]["packet_parts_received"], PACKET_PARTS)
            self.assertEqual(p["message_shown"], p["symptom_report"]["message"])
            self.assertTrue(p["score_sources"] and all(x["url"].startswith("https://") for x in p["score_sources"]))
            self.assertTrue(r["ground_ack"]["delivered"])
            self.assertIsNone(r["ground_ack"]["ground_decision"])

    def test_demo_case_low_score_serious_symptom(self):
        p = next(r["packet"] for r in self.doc["runs"] if r["case_id"] == "C11" and r["mission"] == "mars")
        self.assertEqual(p["score"]["total"], 1)
        self.assertEqual(p["symptom_report"]["level"], "emergency")
        self.assertEqual(p["message_shown"], EMERGENCY_MESSAGE)
        self.assertEqual(p["scan_state"]["left"], "Forward flow")

    def test_delay_never_changes_the_message_shown(self):
        by = {}
        for r in self.doc["runs"]:
            by.setdefault(r["case_id"], set()).add(r["packet"]["message_shown"])
        self.assertTrue(all(len(m) == 1 for m in by.values()))

    def test_committed_replay_matches_a_fresh_run(self):
        committed = json.loads((ROOT / "site" / "replay.json").read_text())
        self.assertEqual(stable(committed), stable(self.doc), "site/replay.json is stale: rerun scripts/reproduce.sh")


@unittest.skipUnless(HAVE_A2A, "a2a-sdk not installed (pip install -r requirements.txt)")
class TestFailedHandoff(unittest.TestCase):
    def test_unreachable_ground_is_reported_not_hidden_and_message_stays(self):
        from agents.handoff import deliver
        case = next(c for c in json.loads((ROOT / "data" / "crew_cases.json").read_text())["cases"] if c["id"] == "C11")
        packet = build_packet(case, "mars")
        ack = asyncio.run(deliver(f"http://127.0.0.1:{free_closed_port()}/", packet))
        self.assertFalse(ack["delivered"])
        self.assertIn("not delivered", ack["status"].lower())
        self.assertIsNone(ack["ground_decision"])
        self.assertEqual(packet["message_shown"], EMERGENCY_MESSAGE)  # shown onboard regardless of the ground


if __name__ == "__main__":
    unittest.main()
