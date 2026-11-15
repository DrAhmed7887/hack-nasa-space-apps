// AI-assisted: written with Claude Code (Anthropic) for the NASA Space Apps 2026 entry. Synthetic data only.
// Component 5: clinical alert orchestrator and safety interlocks. A safety gate, not a decision-maker: it maps engine
// states to a short list of allowed prompts. Clinical decisions stay with the flight surgeon.
import { STATES, FLOW } from "./states.js";
import { EMERGENCY_MESSAGE } from "../symptoms.js";

export const ACTIONS = Object.freeze({
  [STATES.STABLE]: "No configured deterioration pattern; continue the scheduled scans. This never replaces the NASA band.",
  [STATES.WATCH]: "Enhanced monitoring prompt: flight surgeon to review at the next contact. The NASA band still applies.",
  [STATES.DETERIORATING]: "Repeat imaging and clinical review prompt for the flight surgeon.",
  [STATES.RED_FLAG_OVERRIDE]: `${EMERGENCY_MESSAGE} A high-priority packet is generated at once; nothing onboard waits for the ground.`,
  [STATES.DATA_INSUFFICIENT]: "Request valid data. No trend statement is made until it arrives; earlier findings stay visible.",
});
export const FLOW_ACTIONS = Object.freeze({
  [FLOW.INDICATED_PENDING_AUTHORIZATION]: "Offer the Venous Flow Response Assessment to the flight surgeon (order required).",
  [FLOW.FORWARD_FLOW_DURING_MANEUVER]: "Record the measurement. It does not show lower risk and does not change the state above.",
  [FLOW.NO_FORWARD_FLOW_DURING_MANEUVER]: "Escalate for clinical review.",
  [FLOW.INCOMPLETE]: "Record kept; no result shown.",
  [FLOW.LOCKED_EXCLUSION]: "Assessment locked by an exclusion.",
});

// Required warning language (spec v3.1 §13.4), shown in the app and carried in every packet.
export const WARNINGS = Object.freeze([
  "A trend warning is not a diagnosis.",
  "A normal or incomplete scan does not exclude cerebral venous sinus thrombosis.",
  "A missing wearable signal is not evidence of normal flow.",
  "Wearable Doppler is not validated against the NASA duplex threshold in this application.",
  "A positive flow response does not prove thrombosis is absent or future risk is reduced.",
  "Medication changes require an authorised clinician.",
  "Communication delay does not grant medication authority to the application.",
]);

// Outputs the system must never produce: they are human clinical decisions (matched as whole words).
export const FORBIDDEN = Object.freeze(["THROMBOSIS_ABSENT", "CLOT_REVERSED", "VTE_RISK_REDUCED", "SAFE_TO_CONTINUE", "ANTICOAGULATION_INDICATED", "REVERSAL_REQUIRED",
  "AUTONOMOUS_ONBOARD_PROTOCOL_AUTHORIZED", "all clear", "no clot", "safe to fly", "start apixaban", "stop apixaban now", "give reversal"]);
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const FORBIDDEN_RE = FORBIDDEN.map((f) => new RegExp(`(^|[^a-z0-9_])${esc(f.toLowerCase())}($|[^a-z0-9_])`));

export class SafetyInterlockError extends Error {}

export function assertNoForbidden(obj) {
  const text = JSON.stringify(obj).toLowerCase();
  FORBIDDEN_RE.forEach((re, i) => { if (re.test(text)) throw new SafetyInterlockError(`forbidden output: ${FORBIDDEN[i]}`); });
  return obj;
}

export function orchestrate({ trend, flow }) {
  return assertNoForbidden({
    state: trend.state,
    action: ACTIONS[trend.state],
    why: trend.why,
    emergency: trend.state === STATES.RED_FLAG_OVERRIDE,
    high_priority_packet: trend.state === STATES.RED_FLAG_OVERRIDE,
    flow_response: { ...flow, action: FLOW_ACTIONS[flow.status] || null },
    decided_by: "flight surgeon (human); this system only prompts",
  });
}
