<!-- AI-assisted: drafted with Claude Code (Anthropic) from the team's v3 specification; every rule is checked against the quoted source. -->
# VTE Watch v3: rules, sources and sign-off

Every rule the v3 engine applies, where it comes from, and whether it is NASA's, the FDA label's or ours.
**NASA's VTE Risk Score (Engine A) is unchanged.** Nothing in v3 adds, removes or changes a point.

| # | Rule in the app | Kind | Source (exact words in `site/v3/sources.js`) | Code |
|---|---|---|---|---|
| 1 | Only a duplex ultrasound study can feed NASA's "<10 cm/s or retrograde" row; wearable Doppler never can | Claim boundary | NASA/SP-20260005258 REV1 p.20: "A case is defined as abnormal when mean peak velocity is less than 10 cm/s anterograde" (measured by in-flight ultrasound) | `pipeline.js` `scansFromStore` |
| 2 | An ultrasound milestone (L+30, L+60, R-42) is met only by a duplex study within 7 days; a lab result (e.g. an L+14 D-dimer) never meets one | Team rule on NASA's schedule | OCHMO-MTB-007 example schedule; 7-day window is ours | `timeline.js` `milestoneStatus` |
| 3 | Any emergency symptom overrides every score and trend (RED_FLAG_OVERRIDE) | Signed 15 Nov (v2) | SP-20260005258 p.34 (CVST symptoms); the jugular protocol does not exclude sinus clots | `states.js` |
| 4 | No trend statement with fewer than 2 usable scan visits (DATA_INSUFFICIENT) | Team rule | none (conservative default) | `states.js` `MIN_STUDIES` |
| 5 | DETERIORATING = forward flow earlier and low/retrograde now on the same side, or SEC grade rising to 3 or 4 | Team rule using NASA's definitions | SP p.20: abnormal flow definition; SEC grades 1-4 | `states.js` |
| 6 | FLOW_RESPONSE_ASSESSMENT_INDICATED = latest scan low/retrograde, SEC 3-4, or NASA band 2-3 | Team rule (from the team spec) | none: not validated | `states.js` |
| 7 | Flow-response study: logged only with a flight-surgeon order; "positive" = low/retrograde before and forward after; always shown with "does not exclude thrombosis or reduce future VTE risk"; normal flow before = not applicable | Team rule | none: measurement log only | `states.js` `flowResponse` |
| 8 | Newest in-flight scan older than 45 days, a conflicting value, a broken audit chain, no in-flight scan, or no checklist today = packet INCOMPLETE | Team rule | 45 days is ours (NASA's example scans are 30 days apart) | `timeline.js` `dataQuality` |
| 9 | Apixaban regimens shown as recorded by the flight surgeon: prophylaxis 2.5 mg twice a day; treatment 10 mg twice a day for 7 days, then 5 mg twice a day | NASA reference | OCHMO-MTB-007 p.12 | `meds.js` |
| 10 | Landing hold: treatment 48 h, prophylaxis 24 h (MTB-007) or 48 h for apixaban use (SP-20260005258). The approved plan must name which document; the app never picks | NASA reference | MTB-007 p.13; SP p.11 and p.25 | `meds.js` |
| 11 | No countdown without a clinician-approved plan | Claim boundary | — | `meds.js` |
| 12 | EVA: prophylaxis reference hold 24 h before a high-risk EVA | NASA reference | SP p.11 and p.25 | `meds.js` |
| 13 | Interaction flag for combined P-gp and strong CYP3A4 inhibitors (ketoconazole, itraconazole, ritonavir; clarithromycin with the label's no-adjustment note) and inducers (rifampin, carbamazepine, phenytoin, St John's wort). Unlisted drugs: "not a statement that there is no interaction" | FDA label | ELIQUIS label section 7 (DailyMed, 12 Nov 2026) | `meds.js` |
| 14 | Reversal register is an inventory only, shown with NASA's and the label's notes | NASA + FDA reference | MTB-007 p.13; label section 5.2 | `meds.js` |
| 15 | Bleeding context: AVERROES major bleeding 1.4% vs 1.2% per year (context, not a prediction) | NASA reference | SP p.11 | `meds.js` |
| 16 | IJV right/left ratio: 0 NASA points; >1.55 "not a validated predictor"; exactly 1.55 "not defined" | Claim boundary | SP p.21 | `pipeline.js` |
| 17 | Forbidden outputs (THROMBOSIS_ABSENT, VTE_RISK_REDUCED, SAFE_TO_CONTINUE, ANTICOAGULATION_INDICATED, REVERSAL_REQUIRED, "all clear", ...) stop the packet | Safety interlock | — | `orchestrator.js` |

## Sign-off
Rules 2, 4-8 are team rules, not clinically validated. Team physician sign-off: **pending** (status is updated here when signed).
