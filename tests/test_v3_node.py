# AI-assisted: written with Claude Code (Anthropic). Runs the v3 engine acceptance tests (node --test) inside unittest.
from __future__ import annotations

import json
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class TestV3Engine(unittest.TestCase):
    @unittest.skipUnless(shutil.which("node"), "node not installed")
    def test_node_acceptance_suite_passes(self):
        out = subprocess.run(["node", "--test", *sorted(str(p.relative_to(ROOT)) for p in (ROOT / "tests" / "v3").glob("*.test.mjs"))], capture_output=True, text=True, cwd=ROOT, timeout=120)
        self.assertEqual(out.returncode, 0, out.stdout[-4000:] + out.stderr[-2000:])

    def test_site_cases_copy_matches_generated_data(self):
        self.assertEqual(json.loads((ROOT / "site" / "cases.json").read_text()), json.loads((ROOT / "data" / "crew_cases.json").read_text()))

    def test_no_a2a_left(self):
        for p in ("agents", "spike", "site/replay.json", "vte/packet.py"):
            self.assertFalse((ROOT / p).exists(), p)
        pkgs = [ln for ln in (ROOT / "requirements.txt").read_text().splitlines() if ln.strip() and not ln.startswith("#")]
        self.assertFalse([p for p in pkgs if p.lower().startswith("a2a")])


if __name__ == "__main__":
    unittest.main()
