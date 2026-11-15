// AI-assisted: written with Claude Code (Anthropic) for the NASA Space Apps 2026 entry. Synthetic data only.
// Component 3: longitudinal timeline engine (four separate timelines) and component 8: data quality, provenance and
// reconciliation. Nothing here interpolates between scans: a gap stays a gap.
import { TIMELINES, isUsable } from "./store.js";

const byDay = (a, b) => (a.effective_day ?? Infinity) - (b.effective_day ?? Infinity) || a.seq - b.seq;

export function buildTimelines(effective) {
  const t = Object.fromEntries(TIMELINES.map((k) => [k, []]));
  for (const e of effective) t[e.timeline].push(e);
  for (const k of TIMELINES) t[k].sort(byDay);
  return t;
}

// Scheduled ultrasound milestones (NASA MTB-007 example schedule) are satisfied ONLY by a usable duplex study on or
// near the milestone day. Laboratory, wearable or symptom events never satisfy them (e.g. an L+14 D-dimer).
export function milestoneStatus(timelines, schedule, { acceptSimulated, windowDays = 7 } = {}) {
  const studies = timelines.ultrasound.filter((e) => e.observation_type === "IJV_DUPLEX_STUDY" && isUsable(e, acceptSimulated));
  return schedule.map((m) => {
    const hit = studies.find((e) => e.effective_day !== null && Math.abs(e.effective_day - m.day) <= windowDays);
    return { label: m.label, day: m.day, satisfied: !!hit, by: hit ? hit.observation_id : null };
  });
}

// Groups duplex studies into scan visits (one per day) with left and right sides.
export function studyVisits(timelines, acceptSimulated) {
  const visits = new Map();
  for (const e of timelines.ultrasound) {
    if (e.observation_type !== "IJV_DUPLEX_STUDY" || !isUsable(e, acceptSimulated)) continue;
    const v = visits.get(e.effective_day) || { day: e.effective_day, label: e.label, left: null, right: null };
    v[e.payload.side] = e;
    visits.set(e.effective_day, v);
  }
  return [...visits.values()].sort((a, b) => a.day - b.day);
}

// Component 8. Returns issues; any "blocking" issue makes the packet INCOMPLETE.
export function dataQuality(store, timelines, { today, acceptSimulated, staleDays }) {
  const issues = [];
  const add = (code, detail, blocking, obs) => issues.push({ code, detail, blocking, observation_id: obs ? obs.observation_id : null });
  const chain = store.verifyChain();
  if (!chain.ok) add("CHAIN_BROKEN", `audit chain fails at ${chain.broken_at}`, true);
  for (const e of store.all) {
    for (const i of e.adapter_issues) add(i.code, i.detail, false, e);
    if (e.quality !== "VALID") add(`QUALITY_${e.quality}`, `${e.observation_type} ${e.label || ""}`.trim(), false, e);
    if (e.provenance === "simulated") add("SIMULATED", "simulated value (demo)", false, e);
  }
  // duplicates and conflicts: two usable duplex values for the same side and day
  const seen = new Map();
  for (const e of timelines.ultrasound) {
    if (e.observation_type !== "IJV_DUPLEX_STUDY" || !isUsable(e, acceptSimulated)) continue;
    const k = `${e.effective_day}|${e.payload.side}`;
    const prev = seen.get(k);
    if (prev) {
      const same = prev.payload.velocity === e.payload.velocity && prev.payload.direction === e.payload.direction;
      add(same ? "DUPLICATE" : "CONFLICT", `${e.payload.side} IJV, day ${e.effective_day}: ${prev.observation_id} vs ${e.observation_id}`, !same, e);
    } else seen.set(k, e);
  }
  // staleness: the newest usable in-flight duplex study must be recent
  const visits = studyVisits(timelines, acceptSimulated).filter((v) => v.day > 0);
  const latest = visits[visits.length - 1];
  if (latest && Number.isFinite(today) && today - latest.day > staleDays) add("STALE", `newest scan is ${today - latest.day} days old (limit ${staleDays})`, true);
  if (!latest) add("NO_INFLIGHT_SCAN", "no usable in-flight duplex study yet", true);
  const sym = timelines.symptom.filter((e) => isUsable(e, acceptSimulated));
  const lastSym = sym[sym.length - 1];
  if (!lastSym || lastSym.effective_day !== today || !lastSym.payload.checklist_done) add("CHECKLIST_NOT_TODAY", "symptom checklist not done today", true);
  return { issues, blocking: issues.filter((i) => i.blocking), chain };
}

export function provenanceCounts(store) {
  const c = {};
  for (const e of store.all) c[e.provenance] = (c[e.provenance] || 0) + 1;
  return c;
}
