// AI-assisted: written with Claude Code (Anthropic) for the NASA Space Apps 2026 entry. Synthetic data only.
// Wires the components together and builds component 7, the flight-surgeon packet. Runs fully in the browser with no
// network calls, so every interlock works offline. Engine A is NASA's score in ../score.js, unchanged.
import { ObservationStore } from "./store.js";
import { buildTimelines, milestoneStatus, studyVisits, dataQuality, provenanceCounts } from "./timeline.js";
import { trendState, flowResponse } from "./states.js";
import { orchestrate, assertNoForbidden } from "./orchestrator.js";
import { medicationReview } from "./meds.js";
import { score, scanSchedule } from "../score.js";
import { assess } from "../symptoms.js";

export const ENGINE_VERSIONS = Object.freeze({
  nasa_score: "VTE-2026 (NASA/SP-20260005258 REV1), unchanged",
  store: "v3.0", timelines: "v3.0", trend_states: "v3.0-team", flow_response: "v3.0", orchestrator: "v3.0", meds: "v3.0", packet: "v3.0",
});
export const DEFAULTS = Object.freeze({ acceptSimulated: true, staleDays: 45 });
export const CLAIM_BOUNDARIES = Object.freeze([
  "Simulation, synthetic data: not for operational medical use.",
  "Does not detect or predict thrombosis. No diagnostic or predictive performance was measured.",
  "Wearable Doppler is trend-only telemetry; not diagnostic for IJV stasis and never used for NASA's <10 cm/s rule.",
  "No values are interpolated between scans.",
  "The NASA jugular ultrasound protocol does not exclude a clot in the brain's venous sinuses.",
]);
const CREW = "CREW-A"; // pseudonymous

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
  if (f.ddimer_baseline != null) raws.push({ crew_member_id: CREW, observation_type: "DDIMER", label: "In-flight baseline", effective_day: extras.ddimer_baseline_day ?? null, provenance: prov, payload: { value: f.ddimer_baseline, unit: "ng/mL FEU", role: "baseline" } });
  if (f.ddimer_now != null) raws.push({ crew_member_id: CREW, observation_type: "DDIMER", label: "Latest", effective_day: f.mission_day ?? null, provenance: prov, payload: { value: f.ddimer_now, unit: "ng/mL FEU", role: "latest" } });
  for (const w of extras.wearable || []) raws.push({ crew_member_id: CREW, observation_type: "WEARABLE_CW_DOPPLER", label: w.label || null, effective_day: w.day, provenance: prov, source_device: "wearable CW Doppler (unvalidated)", payload: { velocity: w.velocity, unit: "cm/s", direction: null } });
  if (extras.flow_response) raws.push({ crew_member_id: CREW, observation_type: "FLOW_RESPONSE_STUDY", label: "Flow-response study", effective_day: extras.flow_response.day, provenance: prov, source_device: "duplex-ultrasound", payload: extras.flow_response });
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

export function runCase(c, extras = {}, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const store = new ObservationStore();
  for (const r of [...caseToObservations(c, extras), ...(opts.moreObservations || [])]) store.append(r);
  const eff = store.effective();
  const timelines = buildTimelines(eff);
  const today = c.inflight?.mission_day ?? null;
  const scoreInput = { ...c, scans: scansFromStore(timelines, o.acceptSimulated, c.scans) };
  const nasa = score(scoreInput); // Engine A, unchanged
  const symptoms = assess(c.symptoms); // 4C, unchanged
  const quality = dataQuality(store, timelines, { today, acceptSimulated: o.acceptSimulated, staleDays: o.staleDays });
  const visits = studyVisits(timelines, o.acceptSimulated);
  const trend = trendState({ visits, symptoms, band: nasa.nasa_reference_band, blocking: quality.blocking });
  const frStudy = [...timelines.ultrasound].reverse().find((e) => e.observation_type === "FLOW_RESPONSE_STUDY" && e.quality === "VALID");
  const flow = flowResponse(frStudy);
  const decision = orchestrate({ trend, flow });
  const meds = medicationReview({ meds: extras.meds, plan: extras.plan, today });
  const milestones = milestoneStatus(timelines, scanSchedule(c.mission_days), { acceptSimulated: o.acceptSimulated });
  const ratio = extras.ijv_ratio ?? null;
  const packet = assertNoForbidden({
    packet_version: "v3.0",
    crew_member_id: CREW,
    generated_mission_day: today,
    status: quality.blocking.length ? "INCOMPLETE" : "COMPLETE",
    decision_ready: quality.blocking.length === 0,
    missing_or_blocking: quality.blocking.map((i) => `${i.code}: ${i.detail}`),
    operational_use: false,
    engine_versions: ENGINE_VERSIONS,
    nasa_score: { total: nasa.total, band: nasa.nasa_reference_band, items: nasa.items.map((i) => ({ group: i.group, points: i.points, rule: i.rule, source: i.source })) },
    symptom_report: { level: symptoms.level, ticked: symptoms.ticked_labels, sudden_or_severe: symptoms.sudden_or_severe, checklist_done: symptoms.checklist_done, message_shown: symptoms.message, adds_points: 0 },
    trend_state: decision,
    milestones,
    timelines_summary: Object.fromEntries(Object.entries(timelines).map(([k, v]) => [k, v.length])),
    provenance: provenanceCounts(store),
    data_quality: { issues: quality.issues, unresolved_conflicts: quality.issues.filter((i) => i.code === "CONFLICT").length, audit_chain: quality.chain },
    anatomy: ratio === null ? null : { ijv_ratio_r_to_l: ratio, nasa_points: 0,
      text: ratio === 1.55 ? "Exactly 1.55: NASA's report does not define this value. 0 NASA points." : ratio > 1.55 ? "Anatomical surveillance flag; 0 NASA points; not a validated predictor." : "Below 1.55. 0 NASA points; NASA says more data are needed before the ratio predicts anything.", source: "SP-p21-ratio" },
    medication: meds,
    claim_boundaries: CLAIM_BOUNDARIES,
    signoff: opts.signoff || { status: "UNSIGNED", by_role: null, day: null },
  });
  return { store, timelines, nasa, symptoms, quality, visits, trend, flow, decision, meds, milestones, packet };
}

export function packetSummary(p) {
  const lines = [
    `VTE Watch packet ${p.packet_version} · ${p.crew_member_id} · mission day ${p.generated_mission_day ?? "not set"} · SIMULATION`,
    `Status: ${p.status}${p.status === "INCOMPLETE" ? ` (${p.missing_or_blocking.join("; ")})` : ""}`,
    `NASA score: ${p.nasa_score.total} point(s): ${p.nasa_score.band}`,
    `Trend state: ${p.trend_state.state}. ${p.trend_state.action}`,
    `Symptoms: ${p.symptom_report.ticked.length ? p.symptom_report.ticked.join("; ") : "none ticked"}. Shown to crew: ${p.symptom_report.message_shown}`,
    p.trend_state.flow_response ? `Flow response: ${p.trend_state.flow_response.result}. ${p.trend_state.flow_response.note}` : null,
    `Medication: ${p.medication.regimen_label}. Landing: ${p.medication.landing.text}`,
    ...p.medication.interactions.map((i) => `Interaction: ${i.drug}: ${i.flag}`),
    p.anatomy ? `Anatomy: IJV ratio ${p.anatomy.ijv_ratio_r_to_l}. ${p.anatomy.text}` : null,
    `Data quality: ${p.data_quality.issues.length} note(s), ${p.data_quality.unresolved_conflicts} unresolved conflict(s); audit chain ${p.data_quality.audit_chain.ok ? "intact" : "BROKEN"}.`,
    `Sign-off: ${p.signoff.status}${p.signoff.by_role ? ` by ${p.signoff.by_role}` : ""}`,
    ...p.claim_boundaries,
  ];
  return lines.filter(Boolean);
}
