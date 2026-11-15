// AI-assisted: written with Claude Code (Anthropic) for the NASA Space Apps 2026 entry. Synthetic data only.
// Component 5: clinical alert orchestrator and safety interlocks. A safety gate, not a decision-maker: it maps engine
// states to a short list of allowed prompts. Clinical decisions stay with the flight surgeon.
import { STATES, FLOW_RESPONSE } from "./states.js";
import { EMERGENCY_MESSAGE } from "../symptoms.js";

export const ACTIONS = Object.freeze({
  [STATES.STABLE]: "Flow trend unchanged; continue the scheduled scans. This never replaces the NASA band: the flight surgeon acts on the band.",
  [STATES.WATCH]: "Enhanced monitoring prompt: flight surgeon to review at the next contact. The NASA band still applies.",
  [STATES.DETERIORATING]: "Repeat imaging and clinical review prompt for the flight surgeon.",
  [STATES.FLOW_RESPONSE_ASSESSMENT_INDICATED]: "Offer the supervised flow-response measurement workflow (needs a flight-surgeon order).",
  [STATES.RED_FLAG_OVERRIDE]: `${EMERGENCY_MESSAGE} The packet is queued for the ground at once; nothing onboard waits for it.`,
  [STATES.DATA_INSUFFICIENT]: "Request valid data. No trend statement is made until it arrives.",
  [FLOW_RESPONSE.POSITIVE]: "Record the response. It does not show lower risk.",
  [FLOW_RESPONSE.NEGATIVE]: "Escalate for clinical review.",
});

// Words the system must never output: they are human clinical decisions.
export const FORBIDDEN = Object.freeze(["THROMBOSIS_ABSENT", "VTE_RISK_REDUCED", "SAFE_TO_CONTINUE", "ANTICOAGULATION_INDICATED", "REVERSAL_REQUIRED",
  "all clear", "no clot", "safe to fly", "start apixaban", "stop apixaban now", "give reversal"]);

export class SafetyInterlockError extends Error {}

export function assertNoForbidden(obj) {
  const text = JSON.stringify(obj).toLowerCase();
  for (const f of FORBIDDEN) if (text.includes(f.toLowerCase())) throw new SafetyInterlockError(`forbidden output: ${f}`);
  return obj;
}

export function orchestrate({ trend, flow }) {
  const out = {
    state: trend.state,
    action: ACTIONS[trend.state],
    why: trend.why,
    emergency: trend.state === STATES.RED_FLAG_OVERRIDE,
    export_packet_now: trend.state === STATES.RED_FLAG_OVERRIDE,
    flow_response: flow.result === FLOW_RESPONSE.NOT_DONE || flow.result === FLOW_RESPONSE.NOT_APPLICABLE ? null
      : { result: flow.result, action: ACTIONS[flow.result], note: flow.note },
    decided_by: "flight surgeon (human); this system only prompts",
  };
  return assertNoForbidden(out);
}
