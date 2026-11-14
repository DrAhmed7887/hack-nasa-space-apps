# AI-assisted: written with Claude Code (Anthropic) for the NASA Space Apps 2026 entry; reviewed by the team.
"""Check that every code and data file says AI helped make it (Space Apps rule on AI-generated code and data).

- Code files carry the words "AI-assisted" (any case) in their first 10 lines (a comment header).
- Data files are files inside any folder named `data` (any depth, any case):
  - JSON data is an object with an "_ai_assisted" key (JSON has no comments);
  - any other data file is named in DATA_CARD.md as a backticked path, e.g. `data/cases.csv`.

Usage: python3 scripts/check_ai_mark.py   (checks the files git tracks; exit 1 on any miss)
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

MARK = "ai-assisted"
HEADER_LINES = 10
CODE_SUFFIXES = frozenset(
    {".py", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".html", ".css", ".sh", ".bash", ".zsh", ".sql", ".vue", ".svelte"}
)
SKIP_ANYWHERE = frozenset({".git", "node_modules", ".venv", ".hyperframes"})
SKIP_TOP = frozenset({"private"})  # the git-ignored link to the team's notes
SKIP_NAMES_OUTSIDE_DATA = frozenset({"package.json", "package-lock.json", "tsconfig.json"})


def _in_data(parts: tuple[str, ...]) -> bool:
    return any(p.lower() == "data" for p in parts[:-1])


def _skipped(parts: tuple[str, ...]) -> bool:
    if parts[0] in SKIP_TOP or any(p in SKIP_ANYWHERE for p in parts):
        return True
    return parts[-1] in SKIP_NAMES_OUTSIDE_DATA and not _in_data(parts)


def _check_code(path: Path, rel: str) -> str | None:
    with path.open(encoding="utf-8", errors="replace") as fh:
        head = [next(fh, "") for _ in range(HEADER_LINES)]
    if any(MARK in line.lower() for line in head):
        return None
    return f"{rel}: no 'AI-assisted' header in the first {HEADER_LINES} lines"


def _check_data_json(path: Path, rel: str) -> str | None:
    try:
        doc = json.loads(path.read_text(encoding="utf-8-sig"))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        return f"{rel}: not valid JSON ({exc})"
    if not isinstance(doc, dict) or "_ai_assisted" not in doc:
        return f"{rel}: data JSON must be an object with an '_ai_assisted' key"
    return None


def _check_data_other(rel: str, data_card: str | None) -> str | None:
    if data_card is None:
        return f"{rel}: data file but DATA_CARD.md is missing"
    return None if f"`{rel}`" in data_card else f"{rel}: data file not named in DATA_CARD.md as `{rel}`"


def _check_one(root: Path, rel: str, data_card: str | None) -> str | None:
    parts = Path(rel).parts
    path = root / rel
    if not parts or _skipped(parts) or not path.is_file():
        return None  # vendored, private, deleted-but-listed, or not a regular file
    suffix = path.suffix.lower()
    if suffix == ".md":
        return None  # documentation, even inside a data folder
    try:
        if _in_data(parts):
            return _check_data_json(path, rel) if suffix == ".json" else _check_data_other(rel, data_card)
        if suffix in CODE_SUFFIXES:
            return _check_code(path, rel)
    except OSError as exc:
        return f"{rel}: could not be read ({exc})"
    return None


def check(root: Path, files: list[str]) -> list[str]:
    """Return one message per file that lacks its AI-use mark. `files` are paths relative to `root`."""
    card_path = root / "DATA_CARD.md"
    data_card = card_path.read_text(encoding="utf-8") if card_path.is_file() else None
    results = (_check_one(root, rel, data_card) for rel in files)
    return [problem for problem in results if problem]


def main() -> int:
    root = Path(__file__).resolve().parent.parent
    listed = subprocess.run(["git", "ls-files", "-z"], cwd=root, capture_output=True, check=True)
    files = [f for f in listed.stdout.decode("utf-8", errors="surrogateescape").split("\0") if f]
    problems = check(root, files)
    for problem in problems:
        print(problem, file=sys.stderr)
    print(f"check_ai_mark: {len(problems)} file(s) without the AI-use mark")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
