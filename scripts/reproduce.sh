#!/usr/bin/env bash
# AI-assisted: written with Claude Code (Anthropic). Rebuilds everything from a fresh clone, offline, no keys.
# Usage: bash scripts/reproduce.sh   (needs Python 3.12; Node is optional, for the JS parity test)
set -euo pipefail
cd "$(dirname "$0")/.."
python3.12 -m venv .venv 2>/dev/null || python3 -m venv .venv
.venv/bin/python -m pip install -q -r requirements.txt
.venv/bin/python data/generate.py data/crew_cases.json      # 10 seeded synthetic crew cases
.venv/bin/python agents/handoff.py site/replay.json         # real two-agent A2A run, recorded for the site replay
.venv/bin/python -m unittest discover -s tests -v           # NASA rule tests, A2A run, JS parity
.venv/bin/python scripts/check_ai_mark.py
git diff --stat -- data/crew_cases.json || true
echo "Done. Open the app: python3 -m http.server -d site 8000  ->  http://localhost:8000"
