# Regulation, privacy and standards: where VTE Watch stands

Read 15 Nov 2026. **This is the team's reading, not legal or regulatory advice.** A real deployment needs the programme's regulatory, privacy and legal authorities to decide. Every quote below was read from the linked source on 15 Nov; items marked **(team check)** were re-read against the original PDF or page by the team, and **UNVERIFIED** marks what we could not confirm.

## Bottom line

| Question | Our answer today | Why |
|---|---|---|
| Is it a medical device? | **If it became a product: yes, in both the US and the EU.** Today it is a synthetic-data demonstration, not a product. | US: it takes ultrasound measurements and trends them over time, so it fails the first criterion of the clinical decision support exclusion. EU: MDR Rule 11, most defensibly class IIb. |
| Is it an "AI system" under the EU AI Act? | Probably not: it is a fixed, rule-based engine with no learning. | The Act's definition turns on a system that "infers" its outputs. If it were one, it would be high-risk through the MDR. |
| Whose data rules apply? | NASA crew: the Privacy Act (NASA's medical records system 10HIMS covers astronauts and spaceflight participants). EU crew: GDPR. | See section 2. HIPAA status for NASA's astronaut medicine is **not established**, so we claim nothing about HIPAA. |
| Employee rights? | Two NASA score factors (family history, thrombophilia) are **genetic information** under GINA. | The packet marks them and states it is for the flight surgeon and medical team only, never for crew selection or assignment (section 3). |
| Standards? | Aligned in intent with an audit trail that never hides earlier entries and with NASA's crew health record rules. **Not conformant** with IEC 62304, ISO 14971 or any NASA software class. | See section 4. The audit chain uses a non-cryptographic demo hash. |
| Approval level reached | **Demonstration with synthetic data only** (the first of four levels; section 5). | Shadow-mode or operational use needs clinical, security, usability, quality and regulatory gates we have not passed. |

## 1. Medical device law

**United States.** The 21st Century Cures Act excludes some clinical decision support (CDS) software from the device definition, "unless the function is intended to acquire, process, or analyze a medical image or a signal from an in vitro diagnostic device or a pattern or signal from a signal acquisition system" (FD&C Act 520(o)(1)(E), 21 U.S.C. 360j(o), https://www.law.cornell.edu/uscode/text/21/360j). FDA's guidance turns this into four criteria that must all be met.

FDA, *Clinical Decision Support Software*, final guidance, "Document issued on January 29, 2026. This document supersedes 'Clinical Decision Support Software' issued on January 6, 2026." (https://www.fda.gov/media/109618/download) **(team check)**:
- p.7: if that kind of data "is used as an input, then the software function remains a device"; medical images include those from "ultrasound".
- p.8: "pattern" means "multiple, sequential, or repeated measurements of a signal or from a signal acquisition system", while "discrete, episodic, or intermittent point-in-time physiological measurements ... generally do not, by themselves, constitute a pattern."
- p.15: FDA weighs "(a) level of software automation and (b) time-critical nature of the HCP's decision making"; "Automation bias is the propensity of humans to over-rely on a suggestion from an automated system."

What it means for VTE Watch: a single typed-in velocity could be argued to be "medical information", but the product's purpose is to trend serial IJV duplex results over time, and the wearable Doppler is a continuous signal. A red-flag override is time-critical. **We treat it as device software.** The design choices that answer FDA's automation-bias concern (every rule and source shown, no decision without a named human, blocked outputs, no countdown without a signed plan) are good practice either way; they do not make it exempt.

**IMDRF risk category.** As reproduced in MDCG 2019-11 Rev.1 (June 2025), Annex III, Table 1, p.33 (https://health.ec.europa.eu/document/download/b45335c5-1679-4c71-a91c-fc7a4d37f12b_en?filename=mdcg_2019_11_en.pdf): critical situation + drives clinical management = "Class IIb, Category III.i". The IMDRF N12 original was not retrievable (**UNVERIFIED** directly).

**European Union, MDR 2017/745 Annex VIII Rule 11** (quoted in MDCG 2019-11 Rev.1, section 4.2.1, p.17): "Software intended to provide information which is used to take decisions with diagnosis or therapeutic purposes is classified as class IIa, except if such decisions have an impact that may cause: death or an irreversible deterioration of a person's state of health, in which case it is in class III; or a serious deterioration of a person's state of health or a surgical intervention, in which case it is classified as class IIb." Our reading: **class IIb** (drives management in a critical situation). A notified body could argue class III because pulmonary embolism can be fatal. A proposed Rule 11 amendment (Dec 2025) is **UNVERIFIED**.

**EU AI Act (Regulation (EU) 2024/1689).** An "AI system" is one that "infers, from the input it receives, how to generate outputs" (Art. 3(1), https://artificialintelligenceact.eu/article/3/). A device needing notified-body assessment under the MDR would make an AI system high-risk (Art. 6(1), Annex I). The application date for these systems was moved to 2 August 2028 by the Digital Omnibus on AI (https://artificialintelligenceact.eu/ai-act-explorer/digital-omnibus/; third-party site, EUR-Lex text not retrieved: **secondary source**). VTE Watch has fixed, published rules and no learning, so we read it as probably not an AI system; we found no authoritative ruling on that point.

**Spaceflight.** We found no authoritative statement on whether FDA device law applies to devices NASA uses on orbit. A NASA-authored paper describes NASA's own certification path (Government Certification Approval Request, System Acceptance Review) and calls terrestrial oversight "separate from spaceflight regulatory processes" (https://pmc.ncbi.nlm.nih.gov/articles/PMC10810308/). Flight software for human spaceflight would fall under NASA NPR 7150.2, where Class A is "Human Space Flight Software Systems ... needed to perform a primary mission objective of human space flight" (https://nodis3.gsfc.nasa.gov/displayDir.cfm?Internal_ID=N_PR_7150_002D_&page_name=AppendixD).

## 2. Privacy and data protection

| Rule | What it says | What VTE Watch does |
|---|---|---|
| NASA-STD-3001 Vol 1 Rev C [V1 7003] (PDF p.55) **(team check)** | "The method for handling, storing, and transmission of crewmembers' medical health records shall be secured." Rationale cites the Privacy Act of 1974. https://standards.nasa.gov/sites/default/files/standards/NASA/C//nasa-std-3001-vol-1-rev-c-signature.pdf | Synthetic data, no network, nothing stored between sessions. **Not met for real data:** no encryption at rest, no access control (listed as "Not built" in `docs/V3_RULES.md`). |
| NASA-STD-3001 Vol 1 [V1 7001] (p.55) **(team check)** | "The results of all crew health monitoring shall be kept in a permanent retrievable format for evaluation including trend analysis." | Append-only record, amendments keep originals. Not persisted yet (README "Limit"). |
| NASA-STD-3001 Vol 1 [V1 6003] (p.52) **(team check)** | Private medical communications to or from the ground "shall be considered private communication." | Packet `data_handling.transmission` says to send it as a private medical communication. |
| Privacy Act of 1974, 5 U.S.C. 552a(b) | "No agency shall disclose any record which is contained in a system of records ..." without the person's written request or consent, subject to listed exceptions. https://www.law.cornell.edu/uscode/text/5/552a | Packet marked for the flight surgeon and medical team only. |
| NASA system of records 10HIMS (88 FR 69961, 10 Oct 2023) **(team check)** | Covers "active or retired astronauts and active astronaut family members" and "Space Flight Participants"; one routine use is "to international partners for mission support and continuity of care for their employees". https://www.govinfo.gov/content/pkg/FR-2023-10-10/html/2023-22412.htm | A real deployment would sit inside this system, not beside it. Which notice covers NASA's lifetime astronaut health surveillance programme is **UNVERIFIED**. |
| HIPAA | No authoritative NASA or HHS statement found on whether NASA's astronaut medicine is a HIPAA covered entity. | We make no HIPAA claim. |
| GDPR (EU crew, e.g. ESA) | Art. 9(1): processing "data concerning health" and "genetic data" is prohibited unless an exception applies. Art. 22(1): "the right not to be subject to a decision based solely on automated processing". Art. 25(1): measures "such as pseudonymisation" and "data minimisation". Art. 35(3)(b): an impact assessment is required for large-scale processing of these categories. https://gdpr-info.eu/ | Pseudonymous crew id; only the fields NASA's score and the trend need; every decision signed by a human. A data protection impact assessment would be needed before real use. |
| Commercial crew data (Inspiration4, NASA OSDR) | Individual raw data "necessitate an application procedure that mandates approval from an ethical oversight board"; "All crew members have consented for data and sample sharing." https://pmc.ncbi.nlm.nih.gov/articles/PMC11094041 | The app shows only group n, min, max and mean, tested (`tests/test_i4_context.py`). |

## 3. Employee rights

Astronauts are employees, and their employer runs their medical programme. Two rules matter most for this score.

- **GINA (genetic information).** "Genetic information" means information about "(i) such individual's genetic tests, (ii) the genetic tests of family members of such individual, and (iii) the manifestation of a disease or disorder in family members of such individual" (42 U.S.C. 2000ff(4), https://www.law.cornell.edu/uscode/text/42/2000ff) **(team check)**. NASA's score asks for a family history of VTE and for thrombophilia results such as Factor V Leiden, so both are genetic information. The EEOC rule says an employer may not "request, require, or purchase genetic information" outside listed exceptions (29 CFR 1635.8, https://www.law.cornell.edu/cfr/text/29/1635.8). Whether and how GINA's exceptions cover NASA's clinical collection is a legal question we did not resolve.
- **ADA and Rehabilitation Act (medical inquiries).** Employee medical examinations and inquiries must be "job-related and consistent with business necessity", and the results kept "in separate medical files" as confidential records (42 U.S.C. 12112(d), https://www.law.cornell.edu/uscode/text/42/12112). The Rehabilitation Act applies the same standards to federal employees (29 U.S.C. 791(f), https://www.law.cornell.edu/uscode/text/29/791).
- **Ethics.** The 2014 Institute of Medicine report on astronaut health standards lists six principles ("Avoid harm", "Beneficence", "Favorable balance of risk and benefit", "Respect for autonomy", "Fairness", "Fidelity") and says NASA should protect "the privacy and confidentiality of astronaut health data", noting that "Concerns about confidentiality may affect an astronaut's willingness to supply medical data" (https://www.nationalacademies.org/read/18576/chapter/8).

**What the app does (team design rule, not a NASA policy statement).** Every packet carries a `data_handling` block (`site/v3/pipeline.js`, tested in `tests/v3/v31.test.mjs`): the family history and thrombophilia factors are listed as genetic information for clinical use only; distribution is "Flight surgeon and mission medical team only ... not for crew selection, assignment or any other employment decision"; the crew id is pseudonymous; no decision is made by the software alone. The symptom checklist is the astronaut's own report and says plainly that ticking nothing "does not exclude thrombosis".

## 4. Health IT and software standards

| Standard | What it asks | VTE Watch today | Gap |
|---|---|---|---|
| IEC 62304 | "Defines the life cycle requirements for medical device software." (https://webstore.iec.ch/en/publication/22794) | Hackathon code with tests, code review loops and CI; no formal life cycle | Not conformant, not claimed. Safety class would be set by a hazard analysis; unclassified software defaults to the highest class (secondary source). |
| ISO 14971:2019 | A process "to identify the hazards ..., to estimate and evaluate the associated risks, to control these risks, and to monitor the effectiveness of the controls" (https://webstore.iec.ch/publication/60565) | Safety interlocks (blocked outputs, red-flag override, sign-off) exist as code and tests | No hazard analysis or risk management file. |
| IEC 62366-1 | Usability engineering "as it relates to safety" (https://webstore.iec.ch/en/publication/21863) | Plain-language labels, neutral scan wording | No use-error analysis or usability testing with crew or flight surgeons. |
| 21 CFR 11.10(e) | "secure, computer-generated, time-stamped audit trails ... Record changes shall not obscure previously recorded information." (https://www.ecfr.gov/current/title-21/part-11/section-11.10) | Append-only store; amendments hide but keep originals; hash chain | Meets "shall not obscure" in behaviour. Not "secure": FNV-1a is not cryptographic, there is no signature and no real user identity or clock time. Next step: SHA-256 (FIPS 180-4) plus signatures. |
| HL7 FHIR R4/R5 | Observation, Provenance ("tracks information about the activity that created, revised, deleted, or signed a version of a resource"), AuditEvent, MedicationStatement (https://hl7.org/fhir/R4/provenance.html) | Own JSON model whose fields follow these ideas (provenance on every value, amendments, signed packet) | No FHIR export. Synthetic data would carry the FHIR security label `HTEST` ("test health data"; https://hl7.org/fhir/R4/security-labels.html). |
| LOINC, SNOMED CT, UCUM, DICOM, OMOP (spec v3.2 §25.2) | Standard codes for lab tests, findings, units, ultrasound images and research export | Units normalised (cm/s, ng/mL FEU); the record's D-dimer adapter accepts only FEU units | No terminology codes, no DICOM link to the source images, no research export. |
| NASA NPR 7150.2 / NASA-STD-8739.8 | Software classes (Class A for human spaceflight systems) and software assurance | None | A flight version would need classification and independent assurance. |
| NASA-STD-3001 Vol 1 [V1 7001]-[V1 7003], [V1 6003] | See section 2 | See section 2 | Encryption, access control, persistence. |

## 5. Approval levels (spec v3.2 §22.4)

| Level | What it needs | Status |
|---|---|---|
| Demonstration with synthetic data only | Product owner; engineering review; clear synthetic-data labels; no live medication workflow | **Met:** team physician sign-off of the rules (`docs/V3_RULES.md`), three code and clinical review loops, SIMULATION banner, no medication action possible |
| Research / retrospective data | Ethics and data-use approval, de-identification, dataset provenance, analysis plan, no operational alerts | Not started |
| Shadow mode on a mission | Clinical owner, mission medical operations, cybersecurity, device and lab validation, human factors, formal risk review, documented regulatory assessment | Not started |
| Operational | All of the above plus programme medical authority approval, released quality documents, tested manual backup, crew training | Not started |

## Not verified

HIPAA status of NASA astronaut medicine; which NASA records notice covers lifetime astronaut health surveillance; whether GINA's exceptions cover NASA's clinical collection; the proposed MDR Rule 11 amendment; the AI Act Omnibus date from the Official Journal; whether FDA device law applies on orbit; IEC 62304 class wording and IEC 82304-1 and ISO 13485 scopes (paywalled pages not retrieved).

_AI-assisted: drafted with Claude Code from sources fetched on 15 Nov 2026 and checked by the team. Not legal advice._
