# hack-nasa-space-apps

NASA Space Apps Challenge 2026 entry for the challenge "Create Health Monitoring Software for Astronauts on Space Missions".

**Read `private/CLAUDE.md` before anything else.** It holds the handoff, the deadlines, the official rules and the next steps. `private/` is a git-ignored link to the team's notes folder, and paths inside it are relative to `private/`.

@private/CLAUDE.md

## Rules for this repo
- The idea is the team's. AI may brainstorm with the team (questions, facts, critique, comparing the team's own ideas against the judging criteria, scoping) and helps research, build, test and edit. AI does not propose the core solution idea; the team picks it. Note AI assistance in the README and in the headers of code and data files.
- Synthetic data only for all case logic; published aggregate NASA data (no per-person values) may be shown as labelled context. No real patient or astronaut data, no secrets, no personal names, and no Drive or Notion links in tracked files. Never commit `private/`.
- No NASA logos, flags or mission identifiers. No AI-generated images or video without a visible watermark. No likeness of anyone under 18.
- Demo limit: a video of 30 s or less, or up to 7 slides.
- Before the repo goes public, run `python3 ~/.claude/skills/hackathon/scripts/prepublish_scan.py .` and fix everything it finds.
