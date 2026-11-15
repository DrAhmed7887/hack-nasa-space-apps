// AI-assisted: written with Claude Code (Anthropic) for the NASA Space Apps 2026 entry. Synthetic data only.
// Components 1 and 2: device/clinical data adapters and the validated append-only observation store.
// Adapters only validate, normalise units, tag provenance and assign a quality flag. They never score, classify or alert.

export const PROVENANCE = Object.freeze(["measured", "manually_entered", "imported", "simulated", "unavailable", "invalid", "stale"]);
export const TIMELINES = Object.freeze(["ultrasound", "laboratory", "wearable_telemetry", "symptom"]);
export const OBS_TYPES = Object.freeze({
  IJV_DUPLEX_STUDY: "ultrasound", // duplex ultrasound of one side; the only type that may feed NASA's <10 cm/s rule
  FLOW_RESPONSE_STUDY: "ultrasound", // supervised before/after measurement, ordered by the flight surgeon
  DDIMER: "laboratory",
  WEARABLE_CW_DOPPLER: "wearable_telemetry", // trend only: never diagnostic, never fed to NASA's threshold
  SYMPTOM_CHECKLIST: "symptom",
});
// Provenances whose values may be used by the rules. "simulated" is allowed only when the run says so (this demo).
const USABLE = new Set(["measured", "manually_entered", "imported"]);
export const isUsable = (o, acceptSimulated) => o.quality === "VALID" && (USABLE.has(o.provenance) || (acceptSimulated && o.provenance === "simulated"));

export class AdapterError extends Error {}

const VELOCITY_UNITS = { "cm/s": 1, "mm/s": 0.1, "m/s": 100 };
const DDIMER_UNITS = { "ng/mL FEU": 1, "ug/mL FEU": 1000, "mg/L FEU": 1000 };
const DIRECTIONS = new Set(["anterograde", "retrograde", null]);

const isNum = (x) => typeof x === "number" && Number.isFinite(x);

// Turns one raw input into an observation (not yet stored). Throws AdapterError for input that cannot be read at all;
// readable but unusable input becomes quality "INVALID" so the gap stays visible.
export function adapt(raw) {
  if (!raw || typeof raw !== "object") throw new AdapterError("observation must be an object");
  const timeline = OBS_TYPES[raw.observation_type];
  if (!timeline) throw new AdapterError(`unknown observation_type ${JSON.stringify(raw.observation_type)}`);
  if (!PROVENANCE.includes(raw.provenance)) throw new AdapterError(`unknown provenance ${JSON.stringify(raw.provenance)}`);
  if (!(raw.effective_day === null || isNum(raw.effective_day))) throw new AdapterError("effective_day must be a mission day number or null");
  if (typeof raw.crew_member_id !== "string" || !raw.crew_member_id) throw new AdapterError("crew_member_id is required");
  const issues = [];
  const payload = { ...(raw.payload || {}) };
  let quality = raw.provenance === "invalid" ? "INVALID" : raw.provenance === "unavailable" ? "UNAVAILABLE" : "VALID";

  if (raw.observation_type === "IJV_DUPLEX_STUDY" || raw.observation_type === "WEARABLE_CW_DOPPLER") {
    if (raw.observation_type === "IJV_DUPLEX_STUDY" && !["left", "right"].includes(payload.side)) throw new AdapterError("side must be left or right");
    if (payload.velocity != null) {
      const f = VELOCITY_UNITS[payload.unit];
      if (f === undefined) { issues.push({ code: "UNIT_UNKNOWN", detail: `velocity unit ${payload.unit}` }); quality = "INVALID"; }
      else if (!isNum(payload.velocity) || payload.velocity < 0 || payload.velocity * f > 200) { issues.push({ code: "OUT_OF_RANGE", detail: "velocity outside 0-200 cm/s" }); quality = "INVALID"; }
      else {
        if (f !== 1) issues.push({ code: "UNIT_CONVERTED", detail: `${payload.unit} to cm/s` });
        payload.velocity = Math.round(payload.velocity * f * 1000) / 1000;
        payload.unit = "cm/s";
      }
    }
    if (!DIRECTIONS.has(payload.direction ?? null)) { issues.push({ code: "BAD_FIELD", detail: "direction" }); quality = "INVALID"; }
    if (payload.sec_grade != null && ![1, 2, 3, 4].includes(payload.sec_grade)) { issues.push({ code: "BAD_FIELD", detail: "SEC grade must be 1-4" }); quality = "INVALID"; }
    if (raw.observation_type === "IJV_DUPLEX_STUDY" && quality === "VALID" && payload.velocity == null && payload.direction !== "retrograde") {
      issues.push({ code: "MISSING_FIELD", detail: "no velocity and no retrograde flag" });
      quality = "INCOMPLETE";
    }
  }
  if (raw.observation_type === "DDIMER") {
    const f = DDIMER_UNITS[payload.unit];
    if (f === undefined || !isNum(payload.value) || payload.value < 0) { issues.push({ code: "UNIT_UNKNOWN", detail: `D-dimer ${payload.unit}` }); quality = "INVALID"; }
    else { if (f !== 1) issues.push({ code: "UNIT_CONVERTED", detail: `${payload.unit} to ng/mL FEU` }); payload.value = Math.round(payload.value * f * 1000) / 1000; payload.unit = "ng/mL FEU"; }
  }
  if (raw.observation_type === "FLOW_RESPONSE_STUDY") {
    if (!payload.order_id || !payload.ordered_by_role) { issues.push({ code: "MISSING_FIELD", detail: "flow-response study needs a flight-surgeon order" }); quality = "INVALID"; }
    for (const k of ["before", "after"]) {
      const s = payload[k] || {};
      if (!(s.velocity === null || isNum(s.velocity)) || !DIRECTIONS.has(s.direction ?? null)) { issues.push({ code: "BAD_FIELD", detail: k }); quality = "INVALID"; }
    }
  }
  if (raw.observation_type === "SYMPTOM_CHECKLIST") {
    if (!Array.isArray(payload.ticked)) { issues.push({ code: "MISSING_FIELD", detail: "ticked" }); quality = "INVALID"; }
  }
  return {
    observation_id: raw.observation_id || null,
    crew_member_id: raw.crew_member_id,
    timeline,
    observation_type: raw.observation_type,
    label: raw.label ?? null,
    effective_day: raw.effective_day,
    recorded_day: isNum(raw.recorded_day) ? raw.recorded_day : raw.effective_day,
    provenance: raw.provenance,
    source_device: raw.source_device ?? null,
    operator_role: raw.operator_role ?? null,
    quality,
    adapter_issues: issues,
    payload,
    amends_observation_id: raw.amends_observation_id ?? null,
  };
}

// Tamper-evidence for the demo (FNV-1a 32-bit). Not cryptographic: it shows the chain idea, nothing more.
export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}
// Canonical JSON (keys sorted at every depth) so the hash covers every field.
export const canon = (v) => (v === null || typeof v !== "object" ? JSON.stringify(v ?? null)
  : Array.isArray(v) ? `[${v.map(canon).join(",")}]`
  : `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}`);
const deepFreeze = (o) => { Object.values(o).forEach((v) => v && typeof v === "object" && deepFreeze(v)); return Object.freeze(o); };

// Append-only store. Nothing is ever edited or removed: a correction is a new observation that amends an old one.
export class ObservationStore {
  #events = [];
  append(raw) {
    const obs = adapt(raw);
    const seq = this.#events.length + 1;
    const id = obs.observation_id || `OBS-${String(seq).padStart(4, "0")}`;
    if (this.#events.some((e) => e.observation_id === id)) throw new AdapterError(`duplicate observation_id ${id}`);
    if (obs.amends_observation_id && !this.#events.some((e) => e.observation_id === obs.amends_observation_id)) {
      throw new AdapterError(`amends unknown observation ${obs.amends_observation_id}`);
    }
    const prev_hash = this.#events.length ? this.#events[this.#events.length - 1].hash : "00000000";
    const body = { ...obs, observation_id: id, seq, prev_hash };
    const evt = deepFreeze({ ...body, hash: fnv1a(prev_hash + canon(body)) });
    this.#events.push(evt);
    return evt;
  }
  get all() { return [...this.#events]; }
  // The current view: an amended observation is replaced by its newest amendment (the original stays in the log).
  effective() {
    const amended = new Set(this.#events.map((e) => e.amends_observation_id).filter(Boolean));
    return this.#events.filter((e) => !amended.has(e.observation_id));
  }
  verifyChain() {
    let prev = "00000000";
    for (const e of this.#events) {
      const { hash, ...body } = e;
      if (body.prev_hash !== prev || fnv1a(prev + canon(body)) !== hash) return { ok: false, broken_at: e.observation_id };
      prev = hash;
    }
    return { ok: true, broken_at: null };
  }
}
