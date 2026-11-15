// AI-assisted: written with Claude Code (Anthropic) for the NASA Space Apps 2026 entry. Synthetic data only.
// Exact quotes behind every v3 rule. Each rule in the engine names one of these ids. Team physician sign-off: see docs/V3_RULES.md.

export const V3_SOURCES = {
  "MTB-007-p12": {
    doc: "NASA OCHMO-MTB-007 Venous Thrombosis in Spaceflight (8-Jan-26), p.12",
    url: "https://www.nasa.gov/wp-content/uploads/2026/01/ochmo-mtb-007-venous-thrombosis-in-spaceflight.pdf",
    quote: "Treatment: Apixaban 10 mg twice a day for 7 days; afterwards 5 mg twice a day ... Crew with no thrombosis but who have stasis with family history, thrombophilia, and/or who are taking any hormones that increase the risk of VTE ... should be provided prophylaxis: Prophylaxis dose: Apixaban 2.5 mg twice a day. Crew with no thrombosis but who have stasis and no family history and/or thrombophilia and who are not taking any hormones that increase the risk of VTE should be monitored more often, and hydration should be ensured.",
  },
  "MTB-007-p13": {
    doc: "NASA OCHMO-MTB-007 Venous Thrombosis in Spaceflight (8-Jan-26), p.13",
    url: "https://www.nasa.gov/wp-content/uploads/2026/01/ochmo-mtb-007-venous-thrombosis-in-spaceflight.pdf",
    quote: "If a crewmember is taking a treatment dose of Apixiban, it is recommended to stop taking it least 48 hours prior to landing ... If a crewmember is taking a prophylactic dose of Apixiban, it is also recommended to stop taking it least 24 hours prior to landing. NOTE: These are guidelines, and each case presents differently.",
  },
  "MTB-007-p13-reversal": {
    doc: "NASA OCHMO-MTB-007 Venous Thrombosis in Spaceflight (8-Jan-26), p.13",
    url: "https://www.nasa.gov/wp-content/uploads/2026/01/ochmo-mtb-007-venous-thrombosis-in-spaceflight.pdf",
    quote: "Reversal agents are difficult to administer in space, and if other anticoagulants are used, this should be considered.",
  },
  "SP-p11-landing": {
    doc: "NASA/SP-20260005258 REV1 (July 2026), p.11 and p.25",
    url: "https://www.nasa.gov/wp-content/uploads/2026/06/risk-venous-thromboembolism-assessment-sp20260005258.pdf",
    quote: "astronauts will discontinue prophylactic Apixaban 24 hours prior to conducting high-risk extravehicular activities (EVAs) or based on individual Apixaban PK/PD study administration plan and will restart medication upon EVA completion. Additionally, astronauts will discontinue Apixaban use 48 hours prior to landing due to risks associated with landing.",
  },
  "MTB-007-p12-eva": {
    doc: "NASA OCHMO-MTB-007 Venous Thrombosis in Spaceflight (8-Jan-26), p.12",
    url: "https://www.nasa.gov/wp-content/uploads/2026/01/ochmo-mtb-007-venous-thrombosis-in-spaceflight.pdf",
    quote: "In-flight Operational Considerations for Crew with Thrombosis: Restrict crew from both EVA and ARED for at least 30 days.",
  },
  "MTB-007-p12-txa": {
    doc: "NASA OCHMO-MTB-007 Venous Thrombosis in Spaceflight (8-Jan-26), p.12",
    url: "https://www.nasa.gov/wp-content/uploads/2026/01/ochmo-mtb-007-venous-thrombosis-in-spaceflight.pdf",
    quote: "Tranexamic acid should be added as part of an in-flight medical system to be used in case of menorrhagia.",
  },
  "SP-p11-averroes": {
    doc: "NASA/SP-20260005258 REV1 (July 2026), p.11",
    url: "https://www.nasa.gov/wp-content/uploads/2026/06/risk-venous-thromboembolism-assessment-sp20260005258.pdf",
    quote: "AVVEROES Trial Apixaban 5mg vs. aspirin 81-324mg (Connolly et al., 2011): Stroke or systemic embolism 1.6% vs. 3.7%; Major Bleeding 1.4% vs. 1.2%",
  },
  "SP-p20-sec": {
    doc: "NASA/SP-20260005258 REV1 (July 2026), p.20",
    url: "https://www.nasa.gov/wp-content/uploads/2026/06/risk-venous-thromboembolism-assessment-sp20260005258.pdf",
    quote: "Spontaneous echo contrast (SEC) grades 1-4 ... 1 - anechoic; 2 - mild echogenicity; 3 - mild-to-moderate diffuse echogenicity; 4 - moderate echogenicity with organized pattern. ... A case is defined as abnormal when mean peak velocity is less than 10 cm/s anterograde.",
  },
  "SP-p21-ratio": {
    doc: "NASA/SP-20260005258 REV1 (July 2026), p.21",
    url: "https://www.nasa.gov/wp-content/uploads/2026/06/risk-venous-thromboembolism-assessment-sp20260005258.pdf",
    quote: "when right to left ratio of IJV diameters at the skull base were <1.55 cm (of 15 individuals), no stasis or retrograde flow was observed ... When the ratio was >1.55 cm, 50% (8/16 individuals) experienced stasis (<10 cm/s) and/or retrograde flow. ... IJV cross-sectional area right/left ratio provides a pre-flight indicator of those who will not develop stasis. Additional data and analysis are needed to determine if the ratio can be used to predict those who will develop stasis.",
  },
  "SP-p37-ddimer": {
    doc: "NASA/SP-20260005258 REV1 (July 2026), p.37",
    url: "https://www.nasa.gov/wp-content/uploads/2026/06/risk-venous-thromboembolism-assessment-sp20260005258.pdf",
    quote: "D-dimer has low specificity (35-46%) therefore is not a good single diagnostic tool",
  },
  "FDA-apixaban-7": {
    doc: "ELIQUIS (apixaban) US prescribing information (effective 17 Aug 2026; DailyMed setid e9481622-7cc6-418a-acb6-c5450daae9b0), Highlights: Drug Interactions (7.1, 7.2) and section 7.1",
    url: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=e9481622-7cc6-418a-acb6-c5450daae9b0",
    quote: "Combined P-gp and strong CYP3A4 inhibitors increase blood levels of apixaban. Reduce ELIQUIS dose or avoid coadministration. ... Simultaneous use of combined P-gp and strong CYP3A4 inducers reduces blood levels of apixaban: Avoid concomitant use. ... [7.1] For patients receiving ELIQUIS at a dose of 2.5 mg twice daily, avoid coadministration with combined P-gp and strong CYP3A4 inhibitors",
  },
  "FDA-apixaban-bleeding": {
    doc: "ELIQUIS (apixaban) US prescribing information (effective 17 Aug 2026), sections 5.2 and 7.3",
    url: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=e9481622-7cc6-418a-acb6-c5450daae9b0",
    quote: "Coadministration of antiplatelet agents, fibrinolytics, heparin, aspirin, and chronic NSAID use increases the risk of bleeding. ... [5.2] These include aspirin and other antiplatelet agents, other anticoagulants, heparin, thrombolytic agents, selective serotonin reuptake inhibitors, serotonin norepinephrine reuptake inhibitors, and nonsteroidal anti-inflammatory drugs (NSAIDs)",
  },
  "FDA-apixaban-reversal": {
    doc: "ELIQUIS (apixaban) US prescribing information (effective 17 Aug 2026), section 5.2",
    url: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=e9481622-7cc6-418a-acb6-c5450daae9b0",
    quote: "The pharmacodynamic effect of ELIQUIS can be expected to persist for at least 24 hours after the last dose ... Prothrombin complex concentrate (PCC), activated prothrombin complex concentrate or recombinant factor VIIa may be considered, but have not been evaluated in clinical studies ... Protamine sulfate and vitamin K are not expected to affect the anticoagulant activity of apixaban. There is no experience with antifibrinolytic agents (tranexamic acid, aminocaproic acid) in individuals receiving apixaban.",
  },
  TEAM: {
    doc: "Team rule (VTE Watch), not from NASA. Signed by the team physician; not clinically validated.",
    url: "",
    quote: "",
  },
};
