# Data card

**All data in this repository is synthetic.** No real astronaut or patient data is used, stored or shown.

## `data/crew_cases.json`
- **What:** 11 synthetic crew cases (`C01`–`C11`), each with pre-flight factors (age, family history, thrombophilia, ABO blood type, hormone use) and a scan series (baseline, L+30, L+60, R-42: left and right internal jugular vein mean peak velocity and direction stored separately; slots after the mission day are "not recorded"), a symptom report (ticked symptoms, "sudden or severe", "checklist done today") and an in-flight snapshot (mission day, D-dimer baseline and current value). The score's IJV row is derived from the latest recorded in-flight scan.
- **Calibration:** synthetic cases, calibrated to NASA's published 31-astronaut cohort (SP-20260005258 REV1): normal in-flight flow values are drawn (seeded) from the reported 18–70 cm/s range; boundaries are set by NASA's <10 cm/s stasis rule (9.9 and 10.0 cm/s, and C05's 8.5). Source section "Left IJV Peak Flow Velocities Mapped to Anatomical Asymmetry Assessment": "The remainder (8/16 individuals) experienced peak flow velocities of 18-70 cm/s". NASA reports peak velocities and our field is mean peak velocity, so these are values drawn from NASA's reported no-stasis peak-flow range, nothing more; they are not astronaut measurements.
- **How it's made:** `data/generate.py`, seed `20261115`. Each case is designed to hit one NASA action band or one boundary of a NASA rule (age 40/41/50, 10.0 vs 9.9 cm/s, D-dimer +60% vs +60.5%). Values that only need to look plausible (normal velocities 18–70 cm/s, see below, D-dimer baselines 150–250) come from the seeded generator, so every rerun is identical.
- **Expected results:** written by hand from the NASA table in `tests/test_score.py` before the first run. Measured: 11 of 11 cases match (see `tests/test_score.py`).
- **C11** is the demo case: a low score (1 point, age 43) with a new change in vision ticked. Earlier scans are seeded normal flow; C05 has a falling left IJV velocity (a normal-range baseline and L+30, then 8.5 cm/s at L+60) to show a trend. None of it is measured data.
- **Symptom tags** (`emergency: true/false` per symptom, `vte/symptoms.py`) are the team physician's signed rule, not NASA's.
- **Not real:** the velocities and D-dimer values are not drawn from astronaut measurements, and the cases don't represent any person or crew.

## `site/replay.json`
- **What:** a recorded real run of the two A2A agents in `agents/handoff.py` over every case at LEO, the Moon and Mars (33 handoffs, 66 A2A message calls), with the HTTP exchanges (full bodies kept for case `C05` only).
- **Delay:** simulated on a mission clock, at the upper end of each published range (see below). No waiting happens during the run.
- **Rebuild:** `bash scripts/reproduce.sh`. A test checks the committed file matches a fresh run.

## Numbers taken from NASA sources (cited, not ours)

| Number | Used for | Source |
|---|---|---|
| Age over 40 +1, over 50 +2; family history +1/+2; thrombophilia points; non-O blood type +1; hormone 0/+2/+2 | Pre-flight points | NASA/SP-20260005258 REV1 (July 2026), VTE Risk Score for Astronauts |
| "Stasis (less than 10 cm/s blood flow velocity) or retrograde flow" +4 | In-flight point | same |
| ">60% increase from established in-flight D-dimer baseline level" +2 | In-flight point | same |
| "1 point = no additional action", "2-3 points = increased monitoring", "4-6 points = prophylactic apixaban", "> 6 points = need clinical assessment" | Reference band shown for clinician review | same |
| L+30 days, L+60 days, R-42 days | IJV scan schedule ("Example Schedule based on 180-day ISS mission") | OCHMO-MTB-007 |
| LEO "1-1.5 seconds"; Mars "0-40 minutes"; evacuation "1 day or less", "3-11 days", "No evacuation capability" | Mission context | OCHMO-TB-007 Rev A |
| Moon "Comm Latency 5-14 sec" | Simulated lunar delay only | NTRS 20250002759 (AsMA 2025 slides) |

## Choices that are ours, not NASA's (signed by the team physician, 15 Nov 2026)
- The NASA points and bands are used **word for word**; no cut-off of our own is added.
- 0 points: the report lists no band, so the app says so instead of mapping it to a band.
- Two or more non-Factor V Leiden thrombophilias: the report doesn't say how to combine them; the app sums them and flags the case for clinician review.
- The simulated delay is the upper end of each published range.
- The symptom checklist adds no points and its emergency rule is ours (signed 15 Nov 2026); NASA lists the symptoms only as "considered as part of the risk assessment".
- The scan schedule applies the 180-day example's day offsets to the case's mission length.

_AI-assisted: drafted with Claude Code (Anthropic) and checked by the team._
