# AI-assisted: written with Claude Code (Anthropic) for the NASA Space Apps 2026 entry; reviewed by the team.
"""Check that every code and data file says AI helped make it (Space Apps rule on AI-generated code and data).

- Code files carry the words "AI-assisted" in their first 10 lines (a comment header).
- JSON files under data/ are objects with an "_ai_assisted" key (JSON has no comments).
- Other files under data/ are named in DATA_CARD.md.

Usage: python3 scripts/check_ai_mark.py   (checks the files git tracks; exit 1 on any miss)
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

MARK = "AI-assisted"
HEADER_LINES = 10
CODE_SUFFIXES = frozenset({".py", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".html", ".css", ".sh"})
SKIP_DIRS = frozenset({".git", "node_modules", ".venv", "private", ".hyperframes"})
SKIP_NAMES = frozenset({"package.json", "package-lock.json", "tsconfig.json"})


def _skipped(rel: str) -> bool:
    parts = Path(rel).parts
    return any(p in SKIP_DIRS for p in parts) or parts[-1] in SKIP_NAMES


def _check_code(path: Path, rel: str) -> str | None:
    with path.open(encoding="utf-8", errors="replace") as fh:
        head = [next(fh, "") for _ in range(HEADER_LINES)]
    return None if any(MARK in line for line in head) else f"{rel}: no '{MARK}' header in the first {HEADER_LINES} lines"


def _check_data_json(path: Path, rel: str) -> str | None:
    try:
        doc = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        return f"{rel}: not valid JSON ({exc})"
    if not isinstance(doc, dict) or "_ai_assisted" not in doc:
        return f"{rel}: data JSON must be an object with an '_ai_assisted' key"
    return None


def _check_data_other(rel: str, data_card: str | None) -> str | None:
    if data_card is None:
        return f"{rel}: data file but DATA_CARD.md is missing"
    return None if rel in data_card else f"{rel}: data file not named in DATA_CARD.md"


def check(root: Path, files: list[str]) -> list[str]:
    """Return one message per file that lacks its AI-use mark. `files` are paths relative to `root`."""
    card_path = root / "DATA_CARD.md"
    data_card = card_path.read_text(encoding="utf-8") if card_path.is_file() else None
    problems = []
    for rel in files:
        if _skipped(rel):
            continue
        path = root / rel
        in_data = Path(rel).parts[0] == "data"
        if in_data and path.suffix == ".json":
            problem = _check_data_json(path, rel)
        elif path.suffix in CODE_SUFFIXES:
            problem = _check_code(path, rel)
        elif in_data:
            problem = _check_data_other(rel, data_card)
        else:
            problem = None
        if problem:
            problems.append(problem)
    return problems


def main() -> int:
    root = Path(__file__).resolve().parent.parent
    listed = subprocess.run(["git", "ls-files"], cwd=root, capture_output=True, text=True, check=True)
    problems = check(root, [f for f in listed.stdout.splitlines() if f])
    for problem in problems:
        print(problem, file=sys.stderr)
    print(f"check_ai_mark: {len(problems)} file(s) without the AI-use mark")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
