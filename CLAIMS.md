# Claims and their evidence

Every claim or number that appears in the README, the project page, the slides or the video script is listed here with the file, test or script output that backs it. A claim with no evidence row doesn't get published. This list is checked before the demo video is recorded and again before submitting.

| Claim (exact words) | Where it appears | Evidence (file, test or script output) | Checked |
|---|---|---|---|
| "8 of 31 astronauts had a left IJV flow anomaly in flight" | README | NASA/SP-20260005258 REV1: "8 of the 31 subjects were identified as having left IJV flow anomaly" | 15 Nov, against the PDF text |
| "up to 40 minutes each way at Mars" / "No evacuation capability" | README, app | OCHMO-TB-007: "Extended communication latencies (0-40 minutes)", "No evacuation capability". "Each way" is our reading of "latency"; the brief doesn't say one-way or round trip | 15 Nov, against the PDF text |
| "all 10 synthetic cases match totals worked out by hand from the NASA table before the first run" | README, DATA_CARD | `tests/test_score.py` `EXPECTED`, run 15 Nov: 10 tests OK | 15 Nov |
| "3 s, 28 s, 80 min round trip" | README, app | `vte/missions.py` simulated one-way 1.5 s / 14 s / 40 min ×2; `tests/test_handoff.py::test_distance_changes_context_not_score` | 15 Nov |
| "30 handoffs, 60 A2A message calls" | DATA_CARD | `agents/handoff.py` output "runs: 30 \| A2A message posts: 60"; `tests/test_handoff.py` | 15 Nov |
| "The score and band stay the same at LEO, the Moon and Mars" | README, app | `tests/test_handoff.py::test_distance_changes_context_not_score` | 15 Nov |
| "The ground agent makes no clinical decision" | README, app | `agents/handoff.py` `Ground`: `ground_decision: None`; test asserts it | 15 Nov |
| NASA points and bands quoted in the app | app, DATA_CARD | `vte/score.py` strings vs NASA/SP-20260005258 REV1 page 8 table; `tests/test_score.py::test_bands_verbatim` | 15 Nov |
| "41 automated tests" | slides (6) | `python -m unittest discover -s tests` in the project venv / CI: "Ran 41 tests ... OK" (outside the venv, 4 A2A tests skip) | 15 Nov |
| "SIMULATION: NOT FOR OPERATIONAL MEDICAL USE"; "does not detect, diagnose or predict clots"; "risk score is not a diagnostic test" | README, app banner and under the score | Our scope statement: no performance was measured (README Limits). Wording checked in `site/index.html`, `site/app.js` | 15 Nov |
| "The NASA jugular ultrasound protocol does not exclude a clot in the brain's venous sinuses" | app | NASA/SP-20260005258 REV1: sinus-clot cases presented with symptoms; in-flight jugular ultrasound is the protocol (MTB-007). Worded as "does not exclude", not as a measured limit | 15 Nov |

_AI-assisted: this file was drafted with Claude Code and is checked by the team._
