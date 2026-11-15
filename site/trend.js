// AI-assisted: written with Claude Code (Anthropic) for the NASA Space Apps 2026 entry. Synthetic scans only.
// Faithful port of vte/trend.py (the Python is the source of truth; tests/test_trend.py checks they agree).
import { InputError, STASIS_CM_S, num } from "./score.js";

export const FORWARD = "Forward flow";
export const LOW = "Low velocity (mean peak <10 cm/s anterograde)";
export const RETRO = "Retrograde flow";
export const NOT_MEASURED = "Not measured";
export const TREND_NOTE = "These observations neither diagnose nor exclude thrombosis.";
const SIDES = ["left", "right"];

export function classify(side) {
  side = side || {};
  const v = side.mean_peak_velocity_cm_s ?? null;
  const d = side.direction ?? null;
  if (v === null && d === null) return NOT_MEASURED;
  if (d === "retrograde") return RETRO;
  if (v !== null && v < STASIS_CM_S) return LOW;
  return FORWARD;
}

function checkScan(scan) {
  if (scan === null || typeof scan !== "object" || typeof scan.recorded !== "boolean" || typeof scan.in_flight !== "boolean") {
    throw new InputError("each scan needs 'recorded' and 'in_flight' set to true or false");
  }
  for (const side of SIDES) {
    const s = scan[side] || {};
    const d = s.direction ?? null;
    if (d !== null && d !== "anterograde" && d !== "retrograde") throw new InputError(`${side} direction must be one of ['anterograde', 'retrograde'] or null`);
    if ((s.mean_peak_velocity_cm_s ?? null) !== null) num(s.mean_peak_velocity_cm_s, `${side} mean peak velocity`, 0, 200);
  }
}

export function validate(scans) {
  if (!Array.isArray(scans)) throw new InputError("scans must be a list");
  scans.forEach(checkScan);
}

export function latestInFlight(scans) {
  validate(scans);
  for (let i = scans.length - 1; i >= 0; i--) {
    const sc = scans[i];
    if (sc.in_flight && sc.recorded && SIDES.some((s) => classify(sc[s]) !== NOT_MEASURED)) return sc;
  }
  return null;
}

export function ijvFromScans(scans) {
  const sc = latestInFlight(scans);
  if (sc === null) return null;
  const out = {};
  for (const side of SIDES) {
    const s = sc[side] || {};
    if (classify(s) !== NOT_MEASURED) out[side] = { mean_peak_velocity_cm_s: s.mean_peak_velocity_cm_s ?? null, retrograde: s.direction === "retrograde" };
  }
  return out;
}

export function scanState(scans) {
  const sc = latestInFlight(scans);
  if (sc === null) return { label: null, left: NOT_MEASURED, right: NOT_MEASURED, note: "No in-flight scan recorded yet. " + TREND_NOTE };
  return {
    label: sc.label, day: sc.day, left: classify(sc.left), right: classify(sc.right),
    left_velocity_cm_s: sc.left.mean_peak_velocity_cm_s ?? null, right_velocity_cm_s: sc.right.mean_peak_velocity_cm_s ?? null,
    left_direction: sc.left.direction ?? null, right_direction: sc.right.direction ?? null, note: TREND_NOTE,
  };
}

export function trendRows(scans) {
  validate(scans);
  return scans.map((sc) => ({
    label: sc.label, day: sc.day, in_flight: sc.in_flight, recorded: sc.recorded,
    left: sc.recorded ? classify(sc.left) : NOT_MEASURED, right: sc.recorded ? classify(sc.right) : NOT_MEASURED,
  }));
}
