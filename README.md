# hack-nasa-space-apps

An entry for the **NASA Space Apps Challenge 2026**, challenge [Create Health Monitoring Software for Astronauts on Space Missions](https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/) (Boston local event, virtual).

**Status (14 Nov 2026):** repository set up. The idea, the app and the demo are in progress.

- **Data:** synthetic only. No real patient or astronaut data.
- **For judges:** [JUDGES.md](JUDGES.md) maps each judging criterion to its evidence; [CLAIMS.md](CLAIMS.md) lists every public claim with what backs it.

## Use of AI

This follows the Space Apps rules on AI ("SI") use.

- **The idea comes from the team.** No AI tool is used to come up with it.
- **Claude Code (Anthropic)** helps with research checks (each fact traced to its source), code, tests and editing.
- **Gemini (Google), through Antigravity,** reviewed the build plan as an independent critic.
- **Where it shows:** every code file starts with an "AI-assisted" header, every data JSON carries an `_ai_assisted` key, and other data files are listed in the data card. CI fails if a file is missing its mark (`scripts/check_ai_mark.py`).
- No AI-generated images or video are used.
