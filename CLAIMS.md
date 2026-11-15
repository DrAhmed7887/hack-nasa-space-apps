# Claims and their evidence

Every claim or number that appears in the README, the project page, the slides or the video script is listed here with the file, test or script output that backs it. A claim with no evidence row doesn't get published. This list is checked before the demo video is recorded and again before submitting.

| Claim (exact words) | Where it appears | Evidence (file, test or script output) | Checked |
|---|---|---|---|
| "8 of 31 astronauts had a left IJV flow anomaly in flight" | README | NASA/SP-20260005258 REV1: "8 of the 31 subjects were identified as having left IJV flow anomaly" | 15 Nov, against the PDF text |
| "up to 40 minutes each way at Mars" / "No evacuation capability" | README, app | OCHMO-TB-007: "Extended communication latencies (0-40 minutes)", "No evacuation capability". "Each way" is our reading of "latency"; the brief doesn't say one-way or round trip | 15 Nov, against the PDF text |
| "all 11 synthetic cases match totals worked out by hand from the NASA table before the first run" | README, DATA_CARD | `tests/test_score.py` `EXPECTED` (C11 added 15 Nov, worked by hand: age 43 = 1 point) | 15 Nov |
| "3 s, 28 s, 80 min round trip" | README, app | `vte/missions.py` simulated one-way 1.5 s / 14 s / 40 min ×2; `tests/test_handoff.py::test_distance_changes_context_not_score` | 15 Nov |
| "33 handoffs, 66 A2A message calls" | DATA_CARD | `agents/handoff.py` output "runs: 33 \| A2A message posts: 66"; `tests/test_handoff.py` | 15 Nov |
| "The score and band stay the same at LEO, the Moon and Mars" | README, app | `tests/test_handoff.py::test_distance_changes_context_not_score` | 15 Nov |
| "The ground agent makes no clinical decision" | README, app | `agents/handoff.py` `Ground`: `ground_decision: None`; test asserts it | 15 Nov |
| NASA points and bands quoted in the app | app, DATA_CARD | `vte/score.py` strings vs NASA/SP-20260005258 REV1 page 8 table; `tests/test_score.py::test_bands_verbatim` | 15 Nov |
| "68 automated tests" | slides (6) | `python -m unittest discover -s tests` in the project venv: "Ran 68 tests ... OK" (outside the venv, the A2A tests skip) | 15 Nov |
| "SIMULATION: NOT FOR OPERATIONAL MEDICAL USE"; "does not detect, diagnose or predict clots"; "risk score is not a diagnostic test" | README, app banner and under the score | Our scope statement: no performance was measured (README Limits). Wording checked in `site/index.html`, `site/app.js` | 15 Nov |
| "The NASA jugular ultrasound protocol does not exclude a clot in the brain's venous sinuses" | app | NASA/SP-20260005258 REV1: sinus-clot cases presented with symptoms; in-flight jugular ultrasound is the protocol (MTB-007). Worded as "does not exclude", not as a measured limit | 15 Nov |
| "Stasis = mean peak velocity less than 10 cm/s anterograde, or retrograde flow" (labels "Forward flow", "Low velocity (mean peak <10 cm/s anterograde)", "Retrograde flow") | app trend | SP-20260005258 REV1: "mean peak velocity is less than 10 cm/s anterograde"; score row "Stasis (less than 10 cm/s blood flow velocity) or retrograde flow" +4. `tests/test_trend.py` (10.0 vs 9.9 boundary, retrograde at high speed) | 15 Nov |
| "These observations neither diagnose nor exclude thrombosis." | app trend | Our scope statement; no performance measured | 15 Nov |
| "The score's +4 is read from the same latest recorded in-flight scan the trend shows" | README, app | `vte/trend.py` `ijv_from_scans`; `tests/test_trend.py::TestScoreAndTrendNeverDisagree` (every stock case, Python and JS) | 15 Nov |
| Symptom checklist adds no points; the emergency / report-today / none-reported rule | README, app | Rule signed by the team physician 15 Nov. NASA basis: OCHMO-MTB-007 "eyelid edema, mydriasis, headache, and SANS symptoms should be considered as part of the risk assessment"; NASA gives no points. `tests/test_symptoms.py` (each branch, no points, JS parity) | 15 Nov |
| "No listed symptoms reported. This does not exclude thrombosis." | app | Our wording; `tests/test_symptoms.py::test_no_all_clear_wording_anywhere` | 15 Nov |
| Packet carries the score, its sources, the latest scan state, the symptom report and the message shown; a failed hand-off is reported | README, app | `tests/test_handoff.py` (packet parts, demo case C11, failed hand-off) | 15 Nov |
| "A teammate used ChatGPT (OpenAI) to explore features after the team chose VTE" | README | Team statement, 15 Nov | 15 Nov |
| "Four NASA sources" (slide 6, JUDGES, README) | slides, JUDGES, README | `vte/sources.py` has four entries: VTE-2026, MTB-007, TB-007, NTRS-20250002759 | 15 Nov |
| "Real, de-identified values from the 4 Inspiration4 crew (3-day orbital flight, 2021), shown as group range and mean only" | app panel | `site/i4_context.json`, built by `data/i4_summary.py` from OSDR files `LSDS-8_Multiplex_serum.cardiovascular.EvePanel_SUBMITTED.csv` (OSD-575; Fibrinogen, PF4, ng/ml) and `LSDS-7_Complete_Blood_Count_CBC.upload_SUBMITTED.csv` (OSD-569; PLATELET COUNT, Thousand/uL), read 15 Nov. "4 crew", "no in-flight draws" and the timepoints are what the files contain (n = 4 at each of 7 timepoints) | 15 Nov |
| Every number in the panel (n, min, max, mean) | app panel | Computed by `data/i4_summary.py`; `tests/test_i4_context.py` checks only those four statistics are stored and n <= 4 | 15 Nov |
| "Not used in the risk score" | app panel | `tests/test_i4_context.py::test_score_code_does_not_touch_the_context_data` | 15 Nov |
| "Data are courtesy of the NASA Open Science Data Repository" | app panel, README | OSDR credit line as requested by the repository | 15 Nov |

_AI-assisted: this file was drafted with Claude Code and is checked by the team._
