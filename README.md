# VTE Watch: NASA-referenced clot risk, organized for flight-surgeon review

An entry for the **NASA Space Apps Challenge 2026**, challenge [Create Health Monitoring Software for Astronauts on Space Missions](https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/) (Boston local event, virtual). Team: Orbital Health Informatics.

**What it is:** a synthetic-data prototype that puts three things side by side for a flight surgeon: NASA's own VTE risk score with its sources, the crew member's jugular-vein scan trend, and a daily symptom checklist, then hands them to the ground over A2A with a simulated delay.
**What it is not:** a detector, a diagnosis, a prediction or a validated early-warning system. It measures no diagnostic or predictive performance.

**Try it in 30 seconds:** `python3 -m http.server -d site 8000`, open http://localhost:8000, pick case **C11** (score 1 point, yet a new change in vision is ticked): the score stays at 1, the checklist shows its own message, the packet panel shows what the ground receives. No login. Hosted: https://drahmed7887.github.io/hack-nasa-space-apps/ (no login). **Rebuild everything:** `bash scripts/reproduce.sh` (offline, no keys).

> **SIMULATION: NOT FOR OPERATIONAL MEDICAL USE.** Synthetic data for every case; the only real data is a labelled group-summary context panel. VTE Watch ranks and organizes NASA-referenced risk for flight-surgeon review. It does not detect, diagnose or predict clots, and the risk score is not a diagnostic test. New symptoms need their own assessment whatever the score.

## The problem
Astronauts on long missions can develop clots in the internal jugular vein (IJV). In NASA's own data, 8 of 31 astronauts had a left IJV flow anomaly in flight. In July 2026 NASA published a **VTE Risk Score for Astronauts** (NASA/SP-20260005258 REV1) that adds pre-flight factors to in-flight ultrasound and D-dimer findings, with four action bands. Further from Earth, the ground's answer takes longer to arrive: near real time in low Earth orbit, up to 40 minutes each way at Mars, where NASA lists "No evacuation capability" (OCHMO-TB-007).

## What it does
1. **Scores** a crew member with NASA's table, word for word: each point is shown with the NASA rule it comes from, the input value and a link to the source. The total maps to NASA's band, shown as a reference for the clinician.
2. **Schedules** the IJV ultrasound scans from OCHMO-MTB-007 (L+30, L+60, R-42 days) and shows the next one due.
3. **Shows the scan trend** (left and right IJV at baseline, L+30, L+60, R-42) with neutral labels: "Forward flow", "Low velocity (mean peak <10 cm/s anterograde)", "Retrograde flow", "Not measured". The score's +4 is read from the same latest recorded in-flight scan the trend shows, so they cannot disagree.
4. **Collects a daily symptom checklist** in plain words. It adds no points and is shown apart from the score. If a face, arm or grip, speech, vision, hearing, pupil or confusion symptom (or "sudden or severe") is ticked, it says to start the onboard emergency procedure now and not wait for the app or a ground reply; any other symptom says to report today through the mission medical procedure; none ticked says "No listed symptoms reported. This does not exclude thrombosis."
5. **Hands off** the review packet (score, its sources, latest scan state, symptom report and the message shown) from an onboard agent to a ground agent over **A2A** (Agent2Agent protocol 1.0), with the mission's communication delay. The score and band stay the same at LEO, the Moon and Mars; what changes is the earliest time a ground reply could reach the crew (3 s, 28 s, 80 min round trip, simulated at the upper end of NASA's published ranges). One-way delay is not clinical response time.

The ground agent makes **no clinical decision**: it queues the packet for a human flight surgeon.

## How it works
| Part | File | Notes |
|---|---|---|
| NASA VTE score | `vte/score.py` | Pure functions, no randomness. Verbatim rule text with every item |
| Scan schedule | `vte/score.py` (`scan_schedule`) | OCHMO-MTB-007 example schedule |
| Mission context | `vte/missions.py` | OCHMO-TB-007 quotes; delay labelled as simulated |
| A2A agents | `agents/handoff.py` | Two real A2A servers on 127.0.0.1 (a2a-sdk 1.3.0); every HTTP exchange recorded |
| Scan trend | `vte/trend.py`, `site/trend.js` | Neutral labels; velocity and direction stored separately; feeds the score's +4 |
| Symptom checklist | `vte/symptoms.py`, `site/symptoms.js` | Signed rule, no points; Python and JS tested for parity |
| Hand-off packet | `vte/packet.py` | Built once, sent by the onboard agent; failed delivery is reported, never hidden |
| Synthetic cases | `data/generate.py` → `data/crew_cases.json` | 11 cases with scan series and symptom reports, seeded; see [DATA_CARD.md](DATA_CARD.md) |
| Web app | `site/` | Static; recalculates in the browser (`site/score.js`, tested against Python); the A2A panel replays the recorded real run and says so |
| Tests | `tests/` | 68 tests: hand-worked expected totals, NASA rule edges, the real A2A run, JS/Python parity |

**Measured:** all 11 synthetic cases match totals worked out by hand from the NASA table before the first run (`tests/test_score.py`).

## Real NASA data (context only)
The app has a panel with real group summaries (n, min, max, mean; no per-person values) from the Inspiration4 crew: Fibrinogen and PF4 (OSD-575) and platelet count (OSD-569), before and after a 3-day flight, none in flight. It is context only: not used in the risk score, and it says nothing about any individual. Data are courtesy of the NASA Open Science Data Repository (https://osdr.nasa.gov/bio/repo). Details and privacy rule: [DATA_CARD.md](DATA_CARD.md). Rebuild: `python data/i4_summary.py <folder with the two OSDR files>`.

## NASA data and resources used (four sources, as listed in `vte/sources.py`)
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
- **A teammate used ChatGPT (OpenAI)** to explore features after the team chose VTE; the features were adapted and checked against NASA sources with Claude Code.
- **Other models** (Qwen, GPT, Gemini) were asked to compare and critique the team's own candidate directions in a private review.
- **Where it shows:** every code file starts with an "AI-assisted" header, every data JSON carries an `_ai_assisted` key, and other data files are listed in the data card. CI fails if a file is missing its mark (`scripts/check_ai_mark.py`).
- No AI-generated images, video or audio are used. No NASA logos, flags or mission identifiers.
