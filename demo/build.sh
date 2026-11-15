#!/usr/bin/env bash
# AI-assisted: written with Claude Code (Anthropic). Builds the 7-slide demo PDF; member names come from demo/team.local.json (git-ignored).
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p out
python3 - <<'PY'
import json, html
names = ", ".join(html.escape(m) for m in json.load(open("team.local.json"))["members"])
open("out/slides.html", "w").write(open("slides.html").read().replace("{{MEMBERS}}", names))
PY
cp -R shots out/ 2>/dev/null || true
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$CHROME" --headless=new --disable-gpu --no-pdf-header-footer --print-to-pdf="$PWD/out/VTE_Watch_demo.pdf" "file://$PWD/out/slides.html" 2>/dev/null
# The team notes folder is the git-ignored `private/` link in the main checkout (works from a worktree too).
DEST="${DECK_DEST:-$(cd "$(git rev-parse --git-common-dir)/.." && pwd)/private/submission}"
mkdir -p "$DEST"
cp out/VTE_Watch_demo.pdf "$DEST/VTE_Watch_demo.pdf"
echo "built out/VTE_Watch_demo.pdf"
