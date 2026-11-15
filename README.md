# VTE Watch: astronaut blood-clot risk, scored the way NASA publishes it

An entry for the **NASA Space Apps Challenge 2026**, challenge [Create Health Monitoring Software for Astronauts on Space Missions](https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/) (Boston local event, virtual). Team: Orbital Health Informatics.

**Try it:** the app link goes here once GitHub Pages is live. No login. **Rebuild everything:** `bash scripts/reproduce.sh` (offline, no keys).

> Synthetic data only. The score is a **reference for clinician review**, following NASA's published method. It is not a diagnosis, a prediction or a prescription.

## The problem
Astronauts on long missions can develop clots in the internal jugular vein (IJV). In NASA's own data, 8 of 31 astronauts had a left IJV flow anomaly in flight. In July 2026 NASA published a **VTE Risk Score for Astronauts** (NASA/SP-20260005258 REV1) that adds pre-flight factors to in-flight ultrasound and D-dimer findings, with four action bands. Further from Earth, the ground's answer takes longer to arrive: near real time in low Earth orbit, up to 40 minutes each way at Mars, where NASA lists "No evacuation capability" (OCHMO-TB-007).

## What it does
1. **Scores** a crew member with NASA's table, word for word: each point is shown with the NASA rule it comes from, the input value and a link to the source. The total maps to NASA's band, shown as a reference for the clinician.
2. **Schedules** the IJV ultrasound scans from OCHMO-MTB-007 (L+30, L+60, R-42 days) and shows the next one due.
3. **Hands off** the review packet from an onboard agent to a ground agent over **A2A** (Agent2Agent protocol 1.0), with the mission's communication delay. The score and band stay the same at LEO, the Moon and Mars; what changes is when the ground's reply can reach the crew (3 s, 28 s, 80 min round trip, simulated at the upper end of NASA's published ranges).

The ground agent makes **no clinical decision**: it queues the packet for a human flight surgeon.

## How it works
| Part | File | Notes |
|---|---|---|
| NASA VTE score | `vte/score.py` | Pure functions, no randomness. Verbatim rule text with every item |
| Scan schedule | `vte/score.py` (`scan_schedule`) | OCHMO-MTB-007 example schedule |
| Mission context | `vte/missions.py` | OCHMO-TB-007 quotes; delay labelled as simulated |
| A2A agents | `agents/handoff.py` | Two real A2A servers on 127.0.0.1 (a2a-sdk 1.3.0); every HTTP exchange recorded |
| Synthetic cases | `data/generate.py` → `data/crew_cases.json` | 10 cases, seeded; see [DATA_CARD.md](DATA_CARD.md) |
| Web app | `site/` | Static; recalculates in the browser (`site/score.js`, tested against Python); the A2A panel replays the recorded real run and says so |
| Tests | `tests/` | Hand-worked expected totals, NASA rule edges, the real A2A run, JS/Python parity |

**Measured:** all 10 synthetic cases match totals worked out by hand from the NASA table before the first run (`tests/test_score.py`).

## NASA data and resources used
- NASA/SP-20260005258 REV1, *NASA Risk of Venous Thromboembolism in Spaceflight. Outcomes of Working Group Meeting – April 2026* (July 2026): the score, the bands, the stasis and D-dimer criteria. https://www.nasa.gov/wp-content/uploads/2026/06/risk-venous-thromboembolism-assessment-sp20260005258.pdf
- OCHMO-MTB-007, *Venous Thrombosis in Spaceflight*: the IJV scan schedule. https://www.nasa.gov/wp-content/uploads/2026/01/ochmo-mtb-007-venous-thrombosis-in-spaceflight.pdf
- OCHMO-TB-007 Rev A, *Mission Duration*: communication and evacuation by destination. https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-007-mission-duration.pdf
- NTRS 20250002759 (AsMA 2025, *IMM vs IMPACT, Artemis II*): lunar latency 5–14 s. https://ntrs.nasa.gov/citations/20250002759

## Limits
- Synthetic cases only; no astronaut measurements were available or used.
- The score follows NASA's method faithfully; that doesn't make it a validated predictor of future clots, and this project measures no predictive performance.
- NASA notes: "NASA does not routinely test D-dimer levels in astronauts. There are no existing adequate in-flight testing methods." The app scores D-dimer only when a value is entered, and says when it isn't.
- Where the report is silent (0 points; two non-Factor V Leiden thrombophilias together), the app says so and flags the case; see [DATA_CARD.md](DATA_CARD.md).

## For judges
[JUDGES.md](JUDGES.md) maps each judging criterion to its evidence; [CLAIMS.md](CLAIMS.md) lists every public claim with what backs it.

## Use of AI

This follows the Space Apps rules on AI ("SI") use.

- **The idea comes from the team.** The team physician chose the target (VTE in spaceflight), the use of A2A agents and the mission-distance angle. At the team's request, AI tools also critiqued and compared the team's own candidate ideas; no AI tool proposed the core idea.
- **Claude Code (Anthropic)** helped with research checks (each fact traced to its NASA source), code, tests and editing.
- **Other models** (Qwen, GPT, Gemini) were asked to compare and critique the team's own candidate directions in a private review.
- **Where it shows:** every code file starts with an "AI-assisted" header, every data JSON carries an `_ai_assisted` key, and other data files are listed in the data card. CI fails if a file is missing its mark (`scripts/check_ai_mark.py`).
- No AI-generated images, video or audio are used. No NASA logos, flags or mission identifiers.
