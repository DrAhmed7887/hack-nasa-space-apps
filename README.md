# VTE Watch: NASA-referenced clot risk, organized for flight-surgeon review

An entry for the **NASA Space Apps Challenge 2026**, challenge [Create Health Monitoring Software for Astronauts on Space Missions](https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/) (Boston local event, virtual). Team: Orbital Health Informatics.

**What it is:** a synthetic-data, offline-capable prototype for longitudinal venous health monitoring and flight-surgeon decision support. It keeps NASA's own VTE risk score unchanged and builds around it an append-only record with provenance, four separate timelines (ultrasound, laboratory, wearable telemetry, symptoms), bounded trend states, a symptom guardrail, a flow-response measurement log, a medication and landing check, data-quality reconciliation and a signed flight-surgeon packet. No autonomous agents: every clinical decision is the flight surgeon's.
**What it is not:** a detector, a diagnosis, a prediction or a validated early-warning system. It measures no diagnostic or predictive performance.

**Try it in 30 seconds:** `python3 -m http.server -d site 8000`, open http://localhost:8000, pick case **C11** (score 1 point, yet a new change in vision is ticked): the score stays at 1 and the engine goes to RED FLAG OVERRIDE. Then pick **C05**: the left IJV went from forward flow to low velocity and its SEC grade rose, so the state is DETERIORATING; the medication panel flags itraconazole and ibuprofen against apixaban (FDA label) and shows the landing reference from the signed plan. **C12** shows the longitudinal story: slower at L+30, below 10 cm/s at an unscheduled L+47 scan, SEC rising, with an L+14 D-dimer baseline that never counts as a scan. No login. Hosted: https://drahmed7887.github.io/hack-nasa-space-apps/ (no login). **Rebuild everything:** `bash scripts/reproduce.sh` (offline, no keys).

> **SIMULATION: NOT FOR OPERATIONAL MEDICAL USE.** Synthetic data for every case; the only real data is a labelled group-summary context panel. VTE Watch ranks and organizes NASA-referenced risk for flight-surgeon review. It does not detect, diagnose or predict clots, and the risk score is not a diagnostic test. New symptoms need their own assessment whatever the score.

## The problem
Astronauts on long missions can develop clots in the internal jugular vein (IJV). In NASA's own data, 8 of 31 astronauts had a left IJV flow anomaly in flight. In July 2026 NASA published a **VTE Risk Score for Astronauts** (NASA/SP-20260005258 REV1) that adds pre-flight factors to in-flight ultrasound and D-dimer findings, with four action bands. Further from Earth, the ground's answer takes longer to arrive: near real time in low Earth orbit, up to 40 minutes each way at Mars, where NASA lists "No evacuation capability" (OCHMO-TB-007).

## Who uses it, and why VTE
- **The astronaut** fills in the daily symptom checklist onboard. If an emergency symptom is ticked, the page tells them at once to start the onboard emergency procedure and not to wait for the app or the ground. They can also see their own scan trend and what is due next.
- **The crew medical officer** enters the IJV ultrasound results and checks the medication list against the FDA label flags.
- **The flight surgeon** reviews the packet and signs a decision. Every medication or clinical decision stays with them.

Why one risk: NASA published a scoring method for this risk in July 2026, NASA's own data show IJV flow anomalies in 8 of 31 astronauts, and the treatment (apixaban) affects landing and EVA planning. The team chose to cover this one risk from end to end (data, score, trend, symptoms, medication, sign-off) rather than many risks at a shallow level. The same record, timelines and packet could carry other risks later.

## What it does
1. **Scores** a crew member with NASA's table, word for word: each point is shown with the NASA rule it comes from, the input value and a link to the source. The total maps to NASA's band, shown as a reference for the clinician.
2. **Schedules** the IJV ultrasound scans from OCHMO-MTB-007 (L+30, L+60, R-42 days) and shows the next one due.
3. **Shows the scan trend** (left and right IJV at baseline, L+30, L+60, R-42) with neutral labels: "Forward flow", "Low velocity (mean peak <10 cm/s anterograde)", "Retrograde flow", "Not measured". The score's +4 is read from the same latest recorded in-flight scan the trend shows, so they cannot disagree.
4. **Collects a daily symptom checklist** in plain words. It adds no points and is shown apart from the score. If a face, arm or grip, speech, vision, hearing, pupil or confusion symptom (or "sudden or severe") is ticked, it says to start the onboard emergency procedure now and not wait for the app or a ground reply; any other symptom says to report today through the mission medical procedure; none ticked says "No listed symptoms reported. This does not exclude thrombosis."
5. **Runs the v3.1 clinical engine** (section 8 of the app; built to the team's v3.1 specification; rules, sources and sign-off status in [docs/V3_RULES.md](docs/V3_RULES.md)):
   - **Append-only observation store** with provenance on every value (measured, manually entered, imported, simulated, unavailable, invalid, stale), unit normalisation, amendments that never overwrite, and a tamper-evident hash chain (demo hash, not cryptographic). **Limit:** in this prototype the record is rebuilt from the selected case each time the page runs; it is not saved between sessions and new observations cannot yet be imported, so it shows the design of a continuing record, not a working one.
   - **Four separate timelines.** Only a duplex ultrasound study can meet a scan milestone or feed NASA's <10 cm/s row; a lab result (such as an L+14 D-dimer) or wearable Doppler never can. Nothing is interpolated between scans.
   - **Bounded trend states, never a score:** DATA_INSUFFICIENT, RED_FLAG_OVERRIDE (any emergency symptom, whatever the score), DETERIORATING, WATCH, STABLE. STABLE is only possible at a NASA score of 0 or 1, so a trend label can never sit over a high NASA band.
   - **Venous Flow Response Assessment, kept apart from the state:** offered only to the flight surgeon, logged only with an order, locked by red-flag symptoms, and always shown with "does not exclude thrombosis and does not prove that future VTE risk has been reduced".
   - **Safety interlocks:** the orchestrator only prompts; outputs such as THROMBOSIS_ABSENT, SAFE_TO_CONTINUE or ANTICOAGULATION_INDICATED are blocked in code.
   - **Medication and landing check:** NASA's apixaban references, the landing hold (MTB-007: 48 h treatment, 24 h prophylaxis; SP-20260005258: 48 h) computed only from a flight-surgeon-signed plan that names its guidance (no default), EVA references, CYP3A4/P-gp and bleeding-risk interaction flags from the FDA label (unlisted drugs are UNRECONCILED), a bleeding-management inventory, and AVERROES bleeding context labelled as a terrestrial population estimate. It never starts, stops, doses or reverses a medicine.
   - **Data quality and the packet:** no usable in-flight scan, a missed scheduled scan (stale), conflicting values for the same side and day, a broken audit chain, an unset mission day or no symptom checklist today make the packet INCOMPLETE, not decision-ready. An identical duplicate entry is flagged but does not block, because it changes no value. The Flight-Surgeon Packet (JSON download and one-page print) is INCOMPLETE, PENDING_CLINICAL_REVIEW or SIGNED, and carries engine versions, provenance, data-quality state, a communications profile (medication authority always the human flight surgeon), the required warning language and the sign-off decision, an audit record rather than a prescription.
6. **Shows the mission context:** the score and band stay the same at LEO, the Moon and Mars; what changes is the earliest time a ground reply could reach the crew (3 s, 28 s, 80 min round trip, simulated at the upper end of NASA's published ranges). Every safety check runs onboard, in the page, with no network.

## How it works
| Part | File | Notes |
|---|---|---|
| NASA VTE score | `vte/score.py` | Pure functions, no randomness. Verbatim rule text with every item |
| Scan schedule | `vte/score.py` (`scan_schedule`) | OCHMO-MTB-007 example schedule |
| Mission context | `vte/missions.py` | OCHMO-TB-007 quotes; delay labelled as simulated |
| Scan trend | `vte/trend.py`, `site/trend.js` | Neutral labels; velocity and direction stored separately; feeds the score's +4 |
| Symptom checklist | `vte/symptoms.py`, `site/symptoms.js` | Signed rule, no points; Python and JS tested for parity |
| v3 clinical engine | `site/v3/` (`store.js`, `timeline.js`, `states.js`, `orchestrator.js`, `meds.js`, `pipeline.js`, `sources.js`) | Pure functions in the browser, no network calls; rules and sources in `docs/V3_RULES.md` |
| v3 scenario inputs | `site/v3_extras.json` | Synthetic SEC grades, wearable readings, flow-response study, IJV diameters, medication, landing plan, inventory (C04, C05, C11, C12), and the 12th case **C12** (longitudinal demo) |
| Synthetic cases | `data/generate.py` → `data/crew_cases.json` | 11 cases with scan series and symptom reports, seeded and calibrated to NASA's published 31-astronaut cohort (normal flow drawn from the reported 18–70 cm/s no-stasis range; boundaries from the <10 cm/s rule); see [DATA_CARD.md](DATA_CARD.md) |
| Web app | `site/` | Static; recalculates in the browser (`site/score.js`, tested against Python) |
| Tests | `tests/`, `tests/v3/` | Python: hand-worked expected totals, NASA rule edges, JS/Python parity. Node (`node --test tests/v3/*.test.mjs`): the v3 acceptance criteria |

**Measured:** all 11 synthetic cases match totals worked out by hand from the NASA table before the first run (`tests/test_score.py`), and so does C12, the v3 longitudinal case in `site/v3_extras.json` (6 points; `tests/v3/v31.test.mjs`).

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

- **The idea comes from the team.** The team physicians chose the target (VTE in spaceflight), the mission-distance angle and the v3 architecture (an eight-component, no-agent design from the team's own specification, which replaced the earlier A2A agents on 15 Nov). At the team's request, AI tools also critiqued and compared the team's own candidate ideas; no AI tool proposed the core idea.
- **Claude Code (Anthropic)** helped with research checks (each fact traced to its NASA source), code, tests and editing.
- **A teammate used ChatGPT (OpenAI)** to explore features after the team chose VTE; the features were adapted and checked against NASA sources with Claude Code.
- **Other models** (Qwen, GPT, Gemini) were asked to compare and critique the team's own candidate directions in a private review.
- **Where it shows:** every code file starts with an "AI-assisted" header, every data JSON carries an `_ai_assisted` key, and other data files are listed in the data card. CI fails if a file is missing its mark (`scripts/check_ai_mark.py`).
- No AI-generated images, video or audio are used. No NASA logos, flags or mission identifiers.
