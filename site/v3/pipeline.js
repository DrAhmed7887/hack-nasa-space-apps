// AI-assisted: written with Claude Code (Anthropic) for the NASA Space Apps 2026 entry. Synthetic data only.
// Wires the components together and builds component 7, the Flight-Surgeon Packet (spec v3.1 §12). Runs fully in the
// browser with no network calls, so every interlock works offline. Engine A is NASA's score in ../score.js, unchanged.
import { ObservationStore, isUsable, fnv1a, canon } from "./store.js";
import { buildTimelines, milestoneStatus, studyVisits, dataQuality, provenanceCounts } from "./timeline.js";
import { trendState, flowIndicated, flowLifecycle, STATES } from "./states.js";
import { orchestrate, assertNoForbidden, WARNINGS } from "./orchestrator.js";
import { medicationReview } from "./meds.js";
import { score, scanSchedule, reviewContext } from "../score.js";
import { assess } from "../symptoms.js";

export const ENGINE_VERSIONS = Object.freeze({
  nasa_vte_rules: "SP-20260005258_REV1 (unchanged; site/score.js)",
  event_store: "3.1.0", timelines: "3.1.0", longitudinal_engine: "3.1.0-PROPOSED_LOCAL", flow_response: "3.1.0",
  orchestrator: "3.1.0", pharmacology_rules: "3.1.0 (NASA MTB-007, SP-20260005258, FDA label 17 Aug 2026)", packet_schema: "2.0.0",
});
export const DEFAULTS = Object.freeze({ acceptSimulated: true });
export const SIGNOFF_DECISIONS = Object.freeze(["ACKNOWLEDGED", "ESCALATED", "PROPHYLAXIS_APPROVED", "PROPHYLAXIS_DECLINED", "HOLD_SCHEDULE_APPROVED", "OVERRIDE_WITH_REASON"]);
export const CLAIM_BOUNDARIES = Object.freeze([
  "Simulation, synthetic data: not for operational medical use.",
  "Does not detect or predict thrombosis. No diagnostic or predictive performance was measured.",
  "No values are interpolated between scans.",
  ...WARNINGS,
]);
const CREW = "SYNTH-CREW-A"; // pseudonymous

// Component 1 for the stock cases: turns a case (scans, D-dimer, checklist) plus optional extras into raw observations.
export function caseToObservations(c, extras = {}) {
  const prov = "simulated";
  const raws = [];
  for (const sc of c.scans || []) {
    if (!sc.recorded) continue;
    for (const side of ["left", "right"]) {
      const s = sc[side] || {};
      if ((s.mean_peak_velocity_cm_s ?? null) === null && s.direction == null) continue;
      raws.push({ crew_member_id: CREW, observation_type: "IJV_DUPLEX_STUDY", label: sc.label, effective_day: sc.day, provenance: prov,
        source_device: "duplex-ultrasound", operator_role: "crew sonographer (remote-guided)",
        payload: { side, velocity: s.mean_peak_velocity_cm_s ?? null, unit: "cm/s", direction: s.direction ?? null, sec_grade: extras.sec?.[sc.label]?.[side] ?? null, in_flight: sc.in_flight } });
    }
  }
  const f = c.inflight || {};
  const blDay = extras.ddimer_baseline_day ?? null;
  if (f.ddimer_baseline != null) raws.push({ crew_member_id: CREW, observation_type: "DDIMER", label: blDay === 14 ? "L+14 in-flight baseline (proposed by NASA's panel)" : "In-flight baseline", effective_day: blDay, provenance: prov, payload: { value: f.ddimer_baseline, unit: "ng/mL FEU", role: "baseline" } });
  if (f.ddimer_now != null) raws.push({ crew_member_id: CREW, observation_type: "DDIMER", label: "Latest", effective_day: f.mission_day ?? null, provenance: prov, payload: { value: f.ddimer_now, unit: "ng/mL FEU", role: "latest" } });
  for (const w of extras.wearable || []) raws.push({ crew_member_id: CREW, observation_type: "WEARABLE_CW_DOPPLER", label: w.label || null, effective_day: w.day, provenance: prov, source_device: "wearable CW Doppler (unvalidated)", payload: { velocity: w.velocity, unit: "cm/s", direction: null } });
  if (extras.flow_response) raws.push({ crew_member_id: CREW, observation_type: "FLOW_RESPONSE_STUDY", label: "Venous Flow Response Assessment", effective_day: extras.flow_response.day, provenance: prov, source_device: "duplex-ultrasound", payload: extras.flow_response });
  if (c.symptoms) raws.push({ crew_member_id: CREW, observation_type: "SYMPTOM_CHECKLIST", label: "Daily checklist", effective_day: f.mission_day ?? null, provenance: prov, payload: { ...c.symptoms } });
  return raws;
}

// Rebuilds the scan list NASA's score reads (same shape as the case) from the store: only duplex studies, never wearables.
export function scansFromStore(timelines, acceptSimulated, template) {
  const visits = studyVisits(timelines, acceptSimulated);
  return (template || []).map((sc) => {
    const v = visits.find((x) => x.day === sc.day);
    const side = (o) => (o ? { mean_peak_velocity_cm_s: o.payload.velocity ?? null, direction: o.payload.direction ?? null } : { mean_peak_velocity_cm_s: null, direction: null });
    return { label: sc.label, day: sc.day, in_flight: sc.in_flight, recorded: !!v, left: side(v?.left), right: side(v?.right) };
  });
}

// Anatomy watchlist (v3.1 §3.4): exploratory, 0 points, badge only when the metric definition is confirmed.
export function anatomyWatch(a) {
  if (!a) return null;
  const base = { ratio_type: a.ratio_type || null, metric_definition_status: a.metric_definition_status || "REQUIRES_PROTOCOL_CONFIRMATION", nasa_points: 0, source: "SP-p21-ratio",
    caveat: "NASA's text describes a right-to-left diameter ratio at the skull base but prints the 1.55 threshold with \"cm\", and separately names a cross-sectional-area ratio; these are not interchangeable." };
  const r = Number.isFinite(a.right_mm) && Number.isFinite(a.left_mm) && a.left_mm > 0 ? Math.round((a.right_mm / a.left_mm) * 1000) / 1000 : null;
  if (r === null || base.ratio_type !== "DIAMETER" || base.metric_definition_status !== "CONFIRMED") {
    return { ...base, right_to_left_ratio: r, state: "ANATOMY_METRIC_UNRESOLVED", text: "Metric not confirmed against the measurement protocol: no flag shown. 0 NASA points." };
  }
  const text = r === 1.55 ? "Exactly 1.55: NASA's report does not define this value. 0 NASA points."
    : r > 1.55 ? "ANATOMICAL SURVEILLANCE FLAG — R:L IJV DIAMETER RATIO > 1.55. Exploratory cohort stratification signal, not a validated VTE predictor. 0 NASA points."
    : "Below 1.55. 0 NASA points. In NASA's cohort none of 15 below 1.55 had stasis; a group observation that does not exclude stasis or thrombosis here.";
  return { ...base, right_mm: a.right_mm, left_mm: a.left_mm, right_to_left_ratio: r, state: r > 1.55 ? "ANATOMICAL_SURVEILLANCE_FLAG" : "NO_FLAG", text };
}

export function runCase(c, extras = {}, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const store = new ObservationStore();
  for (const r of [...caseToObservations(c, extras), ...(opts.moreObservations || [])]) store.append(r);
  const eff = store.effective();
  const timelines = buildTimelines(eff);
  const today = Number.isFinite(c.inflight?.mission_day) ? c.inflight.mission_day : null;
  const schedule = scanSchedule(c.mission_days);
  const scoreInput = { ...c, scans: scansFromStore(timelines, o.acceptSimulated, c.scans) };
  const nasa = score(scoreInput); // Engine A, unchanged
  const symptoms = assess(c.symptoms); // 4C guardrail, unchanged
  const quality = dataQuality(store, timelines, { today, acceptSimulated: o.acceptSimulated, schedule });
  const visits = studyVisits(timelines, o.acceptSimulated);
  const trend = trendState({ visits, symptoms, total: nasa.total, band: nasa.nasa_reference_band, blocking: quality.blocking });
  const frStudy = [...timelines.ultrasound].reverse().find((e) => e.observation_type === "FLOW_RESPONSE_STUDY" && isUsable(e, o.acceptSimulated));
  const flow = flowLifecycle({ study: frStudy, indicated: flowIndicated(visits), redFlag: trend.state === STATES.RED_FLAG_OVERRIDE });
  const decision = orchestrate({ trend, flow });
  const meds = medicationReview({ meds: extras.meds, plan: extras.plan, today, concern: [STATES.DETERIORATING, STATES.RED_FLAG_OVERRIDE].includes(trend.state) });
  // NASA's two documents differ on prophylaxis for stasis without other risk factors (clinical review, round 2).
  const pre = c.preflight || {};
  const stasisPts = nasa.items.find((i) => i.group === "IJV flow")?.points || 0;
  const nasaDocsNote = nasa.total >= 4 && nasa.total <= 6 && stasisPts === 4 && (pre.family_history || "none") === "none" && !(pre.thrombophilia || []).length && ["none", "low"].includes(pre.hormone || "none")
    ? "NASA documents differ: SP-20260005258 band 4-6 = prophylactic apixaban; OCHMO-MTB-007 p.12: stasis without family history, thrombophilia or hormones → \"monitored more often, and hydration should be ensured\". The flight surgeon decides." : null;
  const milestones = milestoneStatus(timelines, schedule, { acceptSimulated: o.acceptSimulated });
  const anatomy = anatomyWatch(extras.anatomy);
  const ctx = reviewContext(opts.mission || "mars");
  const signoff = opts.signoff && SIGNOFF_DECISIONS.includes(opts.signoff.decision) ? opts.signoff : null;
  const status = quality.blocking.length ? "INCOMPLETE" : signoff ? "SIGNED" : "PENDING_CLINICAL_REVIEW";
  const body = {
    schema_name: "FlightSurgeonPacket", schema_version: "2.0.0",
    crew_member_id: CREW, mission_day: today, data_cutoff_mission_day: today,
    packet_status: status,
    decision_ready: status === "SIGNED",
    missing_or_blocking: quality.blocking.map((i) => `${i.code}: ${i.detail}`),
    operational_use: false,
    comms_profile: { regime: `${(opts.mission || "mars").toUpperCase()}_DELAY_ILLUSTRATIVE`, one_way_latency_seconds: ctx.simulated_one_way_delay_s, estimated_round_trip_seconds: ctx.earliest_ground_reply_s,
      estimate_source: "ILLUSTRATIVE (OCHMO-TB-007, NTRS 20250002759)", workflow_state: "LOCAL_ACTION_AVAILABLE_GROUND_REVIEW_DEFERRED", ground_review_mode: "ASYNCHRONOUS",
      autonomy_scope: "SAFETY_INTERLOCKS_AND_LOCAL_GUIDANCE_ONLY", medication_authority: "HUMAN_FLIGHT_SURGEON_REQUIRED" },
    engine_versions: ENGINE_VERSIONS,
    nasa_score: { total: nasa.total, band: nasa.nasa_reference_band, nasa_documents_note: nasaDocsNote, factors: nasa.items.map((i) => ({ group: i.group, points: i.points, rule: i.rule, input: i.value ?? null, source: i.source })) },
    symptom_report: { level: symptoms.level, ticked: symptoms.ticked_labels, sudden_or_severe: symptoms.sudden_or_severe, checklist_done: symptoms.checklist_done, message_shown: symptoms.message, adds_points: 0 },
    longitudinal_assessment: decision,
    milestones,
    timelines_summary: Object.fromEntries(Object.entries(timelines).map(([k, v]) => [k, v.length])),
    provenance: provenanceCounts(store),
    data_quality: { issues: quality.issues, unresolved_conflicts: quality.issues.filter((i) => i.code === "CONFLICT").length, audit_chain: quality.chain },
    anatomical_watchlist: anatomy,
    medication: meds,
    claim_boundaries: CLAIM_BOUNDARIES,
    signoff: signoff ? { ...signoff, note: "A sign-off decision is an audit record, not a prescription." } : { decision: null, by_role: null, day: null },
  };
  const packet = assertNoForbidden({ ...body, packet_id: `VTEW-PKT-${fnv1a(canon(body))}` });
  return { store, timelines, nasa, symptoms, quality, visits, trend, flow, decision, meds, milestones, anatomy, packet };
}

export function packetSummary(p) {
  const d = p.longitudinal_assessment;
  const lines = [
    `VTE Watch ${p.schema_name} ${p.packet_id} · ${p.crew_member_id} · mission day ${p.mission_day ?? "not set"} · SIMULATION`,
    `Status: ${p.packet_status}${p.packet_status === "INCOMPLETE" ? ` (${p.missing_or_blocking.join("; ")})` : ""}`,
    `NASA score: ${p.nasa_score.total} point(s): ${p.nasa_score.band}`,
    `Longitudinal state: ${d.state}. ${d.action}`,
    `Symptoms: ${p.symptom_report.ticked.length ? p.symptom_report.ticked.join("; ") : "none ticked"}. Shown to crew: ${p.symptom_report.message_shown}`,
    `Flow response assessment: ${d.flow_response.status}${d.flow_response.note ? `. ${d.flow_response.note}` : ""}`,
    `Medication: ${p.medication.regimen_label}. Landing: ${p.medication.landing.text}`,
    ...p.medication.interactions.map((i) => `Interaction: ${i.drug.replaceAll("_", " ")}: ${i.flag}`),
    p.anatomical_watchlist ? `Anatomy: ${p.anatomical_watchlist.text}` : null,
    `Data quality: ${p.data_quality.issues.length} note(s), ${p.data_quality.unresolved_conflicts} unresolved conflict(s); audit chain ${p.data_quality.audit_chain.ok ? "intact" : "BROKEN"}.`,
    `Comms: ${p.comms_profile.workflow_state}; medication authority ${p.comms_profile.medication_authority}.`,
    `Sign-off: ${p.signoff.decision || "none"}${p.signoff.by_role ? ` by ${p.signoff.by_role}, day ${p.signoff.day}` : ""}`,
    ...p.claim_boundaries,
  ];
  return lines.filter(Boolean);
}
