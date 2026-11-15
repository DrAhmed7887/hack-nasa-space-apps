// AI-assisted: written with Claude Code (Anthropic) for the NASA Space Apps 2026 entry. Synthetic data only.
// Component 4B: Engine B, bounded longitudinal states (never a score) and component 4D: the Venous Flow Response
// Assessment lifecycle (a clinician-authorised measurement log, kept separate from the patient's state; spec v3.1 §2.3).
// Neither changes NASA's score. Thresholds are PROPOSED_LOCAL team rules (docs/V3_RULES.md), not clinically validated.
import { classify, FORWARD, LOW, RETRO, NOT_MEASURED } from "../trend.js";

export const STATES = Object.freeze({
  DATA_INSUFFICIENT: "DATA_INSUFFICIENT",
  RED_FLAG_OVERRIDE: "RED_FLAG_OVERRIDE",
  DETERIORATING: "DETERIORATING",
  WATCH: "WATCH",
  STABLE: "STABLE",
});
// Spec v3.1 names in brackets: FORWARD_FLOW_DURING_MANEUVER = POSITIVE_MEASUREMENT_RESPONSE (renamed after clinical review
// so it cannot read as good news or a positive test).
export const FLOW = Object.freeze({
  NOT_INDICATED: "NOT_INDICATED",
  INDICATED_PENDING_AUTHORIZATION: "INDICATED_PENDING_AUTHORIZATION",
  LOCKED_EXCLUSION: "LOCKED_EXCLUSION",
  FORWARD_FLOW_DURING_MANEUVER: "FORWARD_FLOW_DURING_MANEUVER",
  NO_FORWARD_FLOW_DURING_MANEUVER: "NO_FORWARD_FLOW_DURING_MANEUVER",
  INCOMPLETE: "INCOMPLETE",
});
export const FLOW_RESPONSE_NOTE = "Temporary restoration of antegrade flow during a manoeuvre does not exclude thrombosis and does not prove that future VTE risk has been reduced.";
export const MIN_INFLIGHT_STUDIES = 2; // for a DETERIORATING call: two in-flight visits (pre-flight vs in-flight is not like for like)

export const sideClass = (obs) => (obs ? classify({ mean_peak_velocity_cm_s: obs.payload.velocity ?? null, direction: obs.payload.direction ?? null }) : NOT_MEASURED);
const abnormal = (c) => c === LOW || c === RETRO;
const BLOCK_TREND = ["STALE", "CONFLICT", "CHAIN_BROKEN", "MISSION_DAY_UNSET"];
export const BIG_FALL = 0.5; // PROPOSED_LOCAL: a fall of 50% or more from the previous scan on the same side is worth a look

// What the NASA band means for the reader. Never weaker than NASA; 4-6 uses the spec's "consideration" wording.
export function bandNote(total, band) {
  if (total > 6) return `NASA band: ${band}. Clinical assessment required (flight surgeon). This state does not lower that priority.`;
  if (total >= 4) return `NASA band: ${band}. Spec wording: "prophylactic apixaban consideration — clinician review required". The flight surgeon reviews this band.`;
  if (total >= 2) return `NASA band: ${band}. The flight surgeon acts on the band.`;
  return null;
}

function abnormalSides(visit) {
  return ["left", "right"].filter((s) => abnormal(sideClass(visit[s]))).map((s) => `${s} IJV ${sideClass(visit[s]).toLowerCase()}`);
}

// Serial in-flight deterioration (team rules): forward flow earlier, abnormal now; or SEC grade rising to 3-4.
function deteriorationReasons(inflight) {
  const latest = inflight[inflight.length - 1];
  const earlierInflight = inflight.slice(0, -1);
  const why = [];
  if (!latest) return why;
  for (const side of ["left", "right"]) {
    const now = sideClass(latest[side]);
    const fwd = earlierInflight.find((v) => v[side] && sideClass(v[side]) === FORWARD);
    if (abnormal(now) && fwd) why.push(`${side} IJV: forward flow on day ${fwd.day}, now "${now}" (day ${latest.day}).`);
    const g = latest[side]?.payload.sec_grade ?? null;
    const gPrev = [...earlierInflight].reverse().map((v) => v[side]?.payload.sec_grade ?? null).find((x) => x !== null) ?? null;
    if (g !== null && gPrev !== null && g > gPrev && g >= 3) why.push(`${side} IJV: SEC grade rose ${gPrev} to ${g} between in-flight scans.`);
  }
  return why;
}

// visits: from studyVisits(); symptoms: assess() result; total and band: NASA score; blocking: data-quality blocking issues
export function trendState({ visits, symptoms, total, band, blocking }) {
  if (symptoms && symptoms.level === "emergency") return { state: STATES.RED_FLAG_OVERRIDE, why: ["Emergency symptom on the checklist: overrides every score and trend."] };
  const inflight = visits.filter((v) => v.day > 0);
  const latest = visits[visits.length - 1];
  const known = latest ? abnormalSides(latest) : [];
  const bad = blocking.filter((i) => BLOCK_TREND.includes(i.code));
  const note = bandNote(total, band);
  if (bad.length || inflight.length === 0) {
    const why = bad.length ? bad.map((i) => i.detail) : ["No usable in-flight scan yet. A single scan can still give NASA's +4."];
    if (known.length) why.unshift(`Last scan (day ${latest.day}) showed ${known.join(" and ")}: do not read this as normal.`);
    // Review fix: a data problem never hides an earlier deterioration finding (the state stays DATA_INSUFFICIENT per AC11).
    const earlier = deteriorationReasons(inflight);
    if (earlier.length) why.push(`Deterioration found before this data problem (still applies until valid data arrive): ${earlier.join(" ")}`);
    if (note) why.push(note);
    return { state: STATES.DATA_INSUFFICIENT, why };
  }
  const why = deteriorationReasons(inflight);
  if (why.length) return { state: STATES.DETERIORATING, why: note ? [...why, note] : why };
  const earlierInflight = inflight.slice(0, -1);
  // Review fix: a side measured on an earlier in-flight scan but missing from the latest one is flagged, never read as normal.
  for (const side of ["left", "right"]) {
    if (sideClass(latest[side]) !== NOT_MEASURED) continue;
    const last = [...earlierInflight].reverse().find((v) => sideClass(v[side]) !== NOT_MEASURED);
    if (last) why.push(`${side} IJV not measured on day ${latest.day} (last measured day ${last.day}): a missing side is not a normal result.`);
  }
  const secHigh = ["left", "right"].some((s) => (latest[s]?.payload.sec_grade ?? 0) >= 3);
  if (known.length) why.push(inflight.length < MIN_INFLIGHT_STUDIES ? `New in-flight finding vs the pre-flight baseline: ${known.join(" and ")}.` : `Latest scan: ${known.join(" and ")}.`);
  if (secHigh) why.push("Latest scan SEC grade 3 or 4.");
  const prev = visits[visits.length - 2];
  for (const side of ["left", "right"]) {
    const v = latest[side]?.payload.velocity ?? null, pv = prev?.[side]?.payload.velocity ?? null;
    if (v !== null && pv && !abnormal(sideClass(latest[side])) && (pv - v) / pv >= BIG_FALL) {
      why.push(`${side} IJV ${v} cm/s${v === 10 ? ": at NASA's threshold (not below it)" : ""}, a ${Math.round(((pv - v) / pv) * 100)}% fall from the previous scan (day ${prev.day}${prev.day <= 0 ? ", pre-flight; some fall is expected with the fluid shift" : ""}). Below-threshold criteria not met; does not exclude stasis.`);
    }
  }
  if (symptoms && symptoms.level === "report_today") why.push("Non-emergency symptom reported.");
  if (symptoms && symptoms.level === "not_done") why.push("Symptom checklist not done today.");
  if (note) why.push(`No configured deterioration pattern. ${note}`);
  if (why.length) return { state: STATES.WATCH, why };
  const secText = ["left", "right"].map((s) => `${s} SEC ${latest[s]?.payload.sec_grade ?? "not recorded"}`).join(", ");
  return { state: STATES.STABLE, why: [`NASA score ${total}; serial scans show no configured deterioration pattern; ${secText}; no listed symptoms. Not proof of no thrombosis.`] };
}

// Team rule (PROPOSED_LOCAL): an assessment may be offered when the latest scan is low/retrograde or SEC 3-4.
// It is only ever offered: it needs a flight-surgeon order, and an emergency symptom locks it.
export function flowIndicated(visits) {
  const latest = visits[visits.length - 1];
  if (!latest || latest.day <= 0) return false;
  return ["left", "right"].some((s) => abnormal(sideClass(latest[s])) || (latest[s]?.payload.sec_grade ?? 0) >= 3);
}

export function flowLifecycle({ study, indicated, redFlag }) {
  if (redFlag) return { status: FLOW.LOCKED_EXCLUSION, note: "Locked: active red-flag symptoms are an exclusion. Follow the onboard emergency procedure." };
  if (!study) {
    return indicated
      ? { status: FLOW.INDICATED_PENDING_AUTHORIZATION, note: "May be offered to the flight surgeon. Nothing is done without a flight-surgeon order under a mission-approved protocol; the app gives no manoeuvre instructions." }
      : { status: FLOW.NOT_INDICATED, note: null };
  }
  const base = { order_id: study.payload.order_id || null, ordered_by_role: study.payload.ordered_by_role || null, protocol: study.payload.protocol_id || "mission-approved protocol" };
  if (!base.order_id || !base.ordered_by_role) return { ...base, status: FLOW.INCOMPLETE, note: "Not authorised: no flight-surgeon order recorded, so no result is shown." };
  const ex = study.payload.exclusion_checks || {};
  if (study.payload.exclusions_cleared !== true || !ex.thrombus_assessment || !ex.haemodynamics || !ex.signal_quality || /POOR|SEEN_THROMBUS|PRESENT|UNSTABLE|INDETERMINATE/i.test(JSON.stringify(ex))) {
    return { ...base, status: FLOW.INCOMPLETE, note: "Exclusion checks not recorded or not passed (thrombus assessment, haemodynamic stability, signal quality): no result shown." };
  }
  base.exclusion_checks = study.payload.exclusion_checks || null;
  const before = classify({ mean_peak_velocity_cm_s: study.payload.before?.velocity ?? null, direction: study.payload.before?.direction ?? null });
  const after = classify({ mean_peak_velocity_cm_s: study.payload.after?.velocity ?? null, direction: study.payload.after?.direction ?? null });
  if (!abnormal(before) || after === NOT_MEASURED) {
    return { ...base, status: FLOW.INCOMPLETE, before, after, note: "Baseline flow was not low or retrograde, or the after value is missing, so no response can be judged." };
  }
  const fwd = after === FORWARD;
  return {
    ...base, before, after,
    status: fwd ? FLOW.FORWARD_FLOW_DURING_MANEUVER : FLOW.NO_FORWARD_FLOW_DURING_MANEUVER,
    note: fwd ? FLOW_RESPONSE_NOTE : "No forward flow during the manoeuvre. Escalate for clinical review.",
  };
}
