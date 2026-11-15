// AI-assisted: written with Claude Code (Anthropic) for the NASA Space Apps 2026 entry; the rule was signed by the team physician (15 Nov 2026).
// Faithful port of vte/symptoms.py (the Python is the source of truth; tests/test_symptoms.py checks they agree).
// The checklist adds NO points to the NASA score and is shown apart from it.
import { InputError } from "./score.js";

export const EMERGENCY_MESSAGE = "Start your onboard medical emergency procedure now; do not wait for this app or a ground reply.";
export const REPORT_MESSAGE = "Report today through your mission medical procedure.";
export const NONE_MESSAGE = "No listed symptoms reported. This does not exclude thrombosis.";
export const NOT_DONE_MESSAGE = "Checklist not done today. No symptom information has been reported.";

export const SYMPTOMS = [
  { id: "neck_swelling", label: "New neck swelling", emergency: false },
  { id: "vision_change", label: "New change in vision", emergency: true },
  { id: "headache", label: "New or worse headache", emergency: false },
  { id: "puffy_face", label: "Puffy eyelids or face", emergency: false },
  { id: "pupil_larger", label: "One pupil larger", emergency: true },
  { id: "hearing_change", label: "New hearing change", emergency: true },
  { id: "face_drooping", label: "Face drooping", emergency: true },
  { id: "weak_grip", label: "Weak grip or arm on one side", emergency: true },
  { id: "speech_trouble", label: "New trouble speaking", emergency: true },
  { id: "confusion", label: "Confusion", emergency: true },
];
const BY_ID = Object.fromEntries(SYMPTOMS.map((s) => [s.id, s]));
const ORDER = SYMPTOMS.map((s) => s.id);

export const emptyReport = () => ({ ticked: [], sudden_or_severe: false, checklist_done: false });

export function assess(report) {
  if (report === null || report === undefined) report = emptyReport();
  if (typeof report !== "object" || Array.isArray(report)) throw new InputError("symptom report must be an object");
  let ticked = report.ticked ?? [];
  if (!Array.isArray(ticked) || ticked.some((t) => typeof t !== "string" || !Object.hasOwn(BY_ID, t))) {
    throw new InputError(`ticked must be a list of [${ORDER.map((i) => `'${i}'`).join(", ")}]`);
  }
  const severe = report.sudden_or_severe ?? false;
  const done = report.checklist_done ?? false;
  if (typeof severe !== "boolean" || typeof done !== "boolean") throw new InputError("sudden_or_severe and checklist_done must be true or false");
  ticked = [...new Set(ticked)].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  let level, message;
  if (severe || ticked.some((t) => BY_ID[t].emergency)) [level, message] = ["emergency", EMERGENCY_MESSAGE];
  else if (ticked.length) [level, message] = ["report_today", REPORT_MESSAGE];
  else if (done) [level, message] = ["none_reported", NONE_MESSAGE];
  else [level, message] = ["not_done", NOT_DONE_MESSAGE];
  return { level, message, ticked, ticked_labels: ticked.map((t) => BY_ID[t].label), sudden_or_severe: severe, checklist_done: done, adds_points: 0 };
}
