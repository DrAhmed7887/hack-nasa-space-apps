// AI-assisted: written with Claude Code (Anthropic) for the NASA Space Apps 2026 entry. Synthetic data only.
// Component 4B: trend and anomaly engine (bounded states, never a score) and component 4D: venous flow response
// assessment (a supervised measurement logger). Neither changes NASA's score. Thresholds are team rules (docs/V3_RULES.md).
import { classify, FORWARD, LOW, RETRO, NOT_MEASURED } from "../trend.js";

export const STATES = Object.freeze({
  DATA_INSUFFICIENT: "DATA_INSUFFICIENT",
  RED_FLAG_OVERRIDE: "RED_FLAG_OVERRIDE",
  DETERIORATING: "DETERIORATING",
  FLOW_RESPONSE_ASSESSMENT_INDICATED: "FLOW_RESPONSE_ASSESSMENT_INDICATED",
  WATCH: "WATCH",
  STABLE: "STABLE",
});
export const FLOW_RESPONSE = Object.freeze({ POSITIVE: "FLOW_RESPONSE_POSITIVE", NEGATIVE: "FLOW_RESPONSE_NEGATIVE", NOT_DONE: "NOT_DONE", NOT_APPLICABLE: "NOT_APPLICABLE" });
export const FLOW_RESPONSE_NOTE = "Temporary response observed; does not exclude thrombosis or reduce future VTE risk.";
export const MIN_STUDIES = 2;

const sideClass = (obs) => (obs ? classify({ mean_peak_velocity_cm_s: obs.payload.velocity ?? null, direction: obs.payload.direction ?? null }) : NOT_MEASURED);
const abnormal = (c) => c === LOW || c === RETRO;

// visits: from studyVisits(); symptoms: assess() result; band: NASA band text; blocking: data-quality blocking issues
export function trendState({ visits, symptoms, band, blocking }) {
  const why = [];
  if (symptoms && symptoms.level === "emergency") return { state: STATES.RED_FLAG_OVERRIDE, why: ["Emergency symptom on the checklist: overrides every score and trend."] };
  if (visits.length < MIN_STUDIES) return { state: STATES.DATA_INSUFFICIENT, why: [`${visits.length} usable scan visit(s); at least ${MIN_STUDIES} are needed before any trend statement.`] };
  if (blocking.some((i) => i.code === "STALE" || i.code === "CONFLICT" || i.code === "CHAIN_BROKEN")) {
    return { state: STATES.DATA_INSUFFICIENT, why: blocking.filter((i) => ["STALE", "CONFLICT", "CHAIN_BROKEN"].includes(i.code)).map((i) => i.detail) };
  }
  const latest = visits[visits.length - 1];
  const earlier = visits.slice(0, -1);
  let deteriorating = false;
  for (const side of ["left", "right"]) {
    const now = sideClass(latest[side]);
    if (abnormal(now) && earlier.some((v) => sideClass(v[side]) === FORWARD)) { deteriorating = true; why.push(`${side} IJV: forward flow earlier, now "${now}".`); }
    const g = latest[side]?.payload.sec_grade ?? null;
    const gPrev = [...earlier].reverse().map((v) => v[side]?.payload.sec_grade ?? null).find((x) => x !== null) ?? null;
    if (g !== null && gPrev !== null && g > gPrev && g >= 3) { deteriorating = true; why.push(`${side} IJV: SEC grade rose ${gPrev} to ${g}.`); }
  }
  if (deteriorating) return { state: STATES.DETERIORATING, why };
  const secHigh = ["left", "right"].some((s) => (latest[s]?.payload.sec_grade ?? 0) >= 3);
  const latestAbnormal = ["left", "right"].some((s) => abnormal(sideClass(latest[s])));
  if (latestAbnormal || secHigh || (band || "").startsWith("2-3")) {
    if (latestAbnormal) why.push("Latest scan shows low velocity or retrograde flow.");
    if (secHigh) why.push("Latest scan SEC grade 3 or 4.");
    if ((band || "").startsWith("2-3")) why.push("NASA band 2-3 points (increased monitoring).");
    return { state: STATES.FLOW_RESPONSE_ASSESSMENT_INDICATED, why };
  }
  const allForward = ["left", "right"].every((s) => [FORWARD, NOT_MEASURED].includes(sideClass(latest[s])));
  if (allForward && symptoms && symptoms.level === "none_reported") return { state: STATES.STABLE, why: ["Latest scan forward flow, SEC grade below 3, no listed symptoms."] };
  return { state: STATES.WATCH, why: symptoms && symptoms.level === "report_today" ? ["Non-emergency symptom reported."] : ["No trend change, but not all stability conditions are met."] };
}

// Component 4D: logs a flight-surgeon-ordered before/after measurement. It records what was measured; it never
// infers treatment effect, risk reduction or absence of thrombosis.
export function flowResponse(study) {
  if (!study) return { result: FLOW_RESPONSE.NOT_DONE, note: null };
  const before = classify({ mean_peak_velocity_cm_s: study.payload.before?.velocity ?? null, direction: study.payload.before?.direction ?? null });
  const after = classify({ mean_peak_velocity_cm_s: study.payload.after?.velocity ?? null, direction: study.payload.after?.direction ?? null });
  if (!abnormal(before)) {
    return { result: FLOW_RESPONSE.NOT_APPLICABLE, before, after, order_id: study.payload.order_id, ordered_by_role: study.payload.ordered_by_role,
      maneuver: study.payload.maneuver || "as ordered", note: "Baseline flow was not low or retrograde, so no response can be judged." };
  }
  const positive = after === FORWARD;
  return {
    result: positive ? FLOW_RESPONSE.POSITIVE : FLOW_RESPONSE.NEGATIVE,
    before, after, order_id: study.payload.order_id, ordered_by_role: study.payload.ordered_by_role, maneuver: study.payload.maneuver || "as ordered",
    note: positive ? FLOW_RESPONSE_NOTE : "No forward-flow response recorded. Escalate for clinical review.",
  };
}
