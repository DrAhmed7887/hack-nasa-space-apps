# Data card

**All case data in this repository is synthetic.** No real astronaut or patient data drives any case, score or rule. The one exception is a labelled context panel of published group summaries (no per-person values) from NASA's Open Science Data Repository; see "Real aggregate data" below.

## `data/crew_cases.json`
- **What:** 11 synthetic crew cases (`C01`–`C11`), each with pre-flight factors (age, family history, thrombophilia, ABO blood type, hormone use) and a scan series (baseline, L+30, L+60, R-42: left and right internal jugular vein mean peak velocity and direction stored separately; slots after the mission day are "not recorded"), a symptom report (ticked symptoms, "sudden or severe", "checklist done today") and an in-flight snapshot (mission day, D-dimer baseline and current value). The score's IJV row is derived from the latest recorded in-flight scan.
- **Calibration:** synthetic cases, calibrated to NASA's published 31-astronaut cohort (SP-20260005258 REV1): normal in-flight flow values are drawn (seeded) from the reported 18–70 cm/s range; boundaries are set by NASA's <10 cm/s stasis rule (9.9 and 10.0 cm/s, and C05's 8.5). Source section "Left IJV Peak Flow Velocities Mapped to Anatomical Asymmetry Assessment": "The remainder (8/16 individuals) experienced peak flow velocities of 18-70 cm/s". NASA reports peak velocities and our field is mean peak velocity, so these are values drawn from NASA's reported no-stasis peak-flow range, nothing more; they are not astronaut measurements.
- **How it's made:** `data/generate.py`, seed `20261115`. Each case is designed to hit one NASA action band or one boundary of a NASA rule (age 40/41/50, 10.0 vs 9.9 cm/s, D-dimer +60% vs +60.5%). Values that only need to look plausible (normal velocities 18–70 cm/s, see below, D-dimer baselines 150–250) come from the seeded generator, so every rerun is identical.
- **Expected results:** written by hand from the NASA table in `tests/test_score.py` before the first run. Measured: 11 of 11 cases match (see `tests/test_score.py`). The 12th case, C12, lives in `site/v3_extras.json` (see below) and also matches its hand-worked total.
- **C11** is the demo case: a low score (1 point, age 43) with a new change in vision ticked. Earlier scans are seeded normal flow; C05 has a falling left IJV velocity (a normal-range baseline and L+30, then 8.5 cm/s at L+60) to show a trend. None of it is measured data.
- **Symptom tags** (`emergency: true/false` per symptom, `vte/symptoms.py`) are the team physician's signed rule, not NASA's.
- **Not real:** the velocities and D-dimer values are not drawn from astronaut measurements, and the cases don't represent any person or crew.

## `site/cases.json`
- A byte-for-byte copy of `data/crew_cases.json` that the static app loads (written by `data/generate.py`; a test checks they match).

## `site/v3_extras.json` (synthetic v3 scenario inputs)
- **C12** (in `extra_cases`): a 12th synthetic case for the longitudinal story, total worked out by hand before the run (age 44 +1, non-O +1, unscheduled L+47 left IJV 8.0 cm/s +4, D-dimer 300 vs an L+14 baseline of 210 = +42.9%, 0) = 6 points. It lives in this file, so the original 11 hand-worked cases are unchanged.
- **What:** for C05, C11, C04 and C12: SEC grades per scan (NASA's 1-4 scale, SP-20260005258 p.20), wearable Doppler readings (C05; trend-only), one flight-surgeon-ordered flow-response study (C05), raw right and left IJV diameters with the ratio type and whether the metric is confirmed (C04 unconfirmed, to show that no flag appears), the apixaban regimen recorded by the flight surgeon, concomitant medicines, a clinician-approved landing plan (C04 has none, to show that no countdown appears), and a synthetic bleeding-management inventory with the label's notes.
- **How it's made:** written by hand with Claude Code to exercise each v3 rule once. Not measured data, not any person.
- **(Removed 15 Nov)** `site/replay.json`, the recorded A2A run, was removed with the A2A agents when the team chose the v3 no-agent architecture.

## Real aggregate data (separate from the synthetic cases): `site/i4_context.json`
- **What:** group summaries only, from NASA's Open Science Data Repository, for the 4 Inspiration4 crew (3-day orbital flight, 2021): n, min, max and mean per analyte and timepoint (L-92, L-44, L-3, R+1, R+45, R+82, R+194; blood was drawn before and after flight, none in flight). Analytes: Fibrinogen and PF4 (ng/ml, OSD-575, Eve Technologies HDCVD9 panel, file `LSDS-8_Multiplex_serum.cardiovascular.EvePanel_SUBMITTED.csv`) and Platelet count (Thousand/uL, OSD-569, file `LSDS-7_Complete_Blood_Count_CBC.upload_SUBMITTED.csv`).
- **Privacy:** no per-person value, subject id or sex is stored or shown. The raw OSDR files are not in this repository. `data/i4_summary.py` reads them from a folder you download them to and writes the summary; `tests/test_i4_context.py` checks the output has only n, min, max and mean.
- **Use:** context panel in the app only. It is not used in the risk score, the symptom rule or the packet, and says nothing about any individual. Not a flight-risk reference.
- **Exclusion (team physician, 15 Nov):** one platelet value at L-92, far below the lab range (140-400 Thousand/uL), was excluded as a likely recording error, so L-92 shows n = 3. All other values are as recorded.
- **Credit:** "Data are courtesy of the NASA Open Science Data Repository (https://osdr.nasa.gov/bio/repo)". Studies: https://osdr.nasa.gov/bio/repo/data/studies/OSD-575 and https://osdr.nasa.gov/bio/repo/data/studies/OSD-569. The OSDR API exposes no separate dataset DOI; the publications it lists for both studies are doi:10.1038/s41586-024-07639-y and doi:10.1038/s41467-024-48806-z.

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
