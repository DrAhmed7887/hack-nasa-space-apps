// AI-assisted: written with Claude Code (Anthropic) for the NASA Space Apps 2026 entry. Synthetic data only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const root = new URL("../../", import.meta.url);
const load = (p) => JSON.parse(readFileSync(new URL(p, root), "utf8"));
const CASES = load("data/crew_cases.json").cases;
const EXTRAS = load("site/v3_extras.json");
const clone = (x) => structuredClone(x);
const byId = (id) => clone(CASES.find((c) => c.id === id));
const extrasFor = (id) => clone(EXTRAS.cases[id] || {});

import { ObservationStore, AdapterError, adapt } from "../../site/v3/store.js";
import { runCase } from "../../site/v3/pipeline.js";

const duplex = (o = {}) => ({ crew_member_id: "CREW-A", observation_type: "IJV_DUPLEX_STUDY", label: "L+30 days", effective_day: 30, provenance: "measured", payload: { side: "left", velocity: 20, unit: "cm/s", direction: "anterograde" }, ...o });

test("AC10: stored events are frozen (deep) and mutation throws in strict mode", () => {
  const s = new ObservationStore();
  const e = s.append(duplex());
  assert.ok(Object.isFrozen(e));
  assert.ok(Object.isFrozen(e.payload));
  assert.throws(() => { e.quality = "HACKED"; }, TypeError);
  assert.throws(() => { e.payload.velocity = 99; }, TypeError);
  assert.equal(s.all[0].payload.velocity, 20);
});
test("AC10: amendment hides the original in effective() but keeps it in all", () => {
  const s = new ObservationStore();
  const a = s.append(duplex({ observation_id: "O1" }));
  const b = s.append(duplex({ observation_id: "O2", amends_observation_id: "O1", payload: { side: "left", velocity: 22, unit: "cm/s", direction: "anterograde" } }));
  assert.equal(s.all.length, 2);
  assert.deepEqual(s.effective().map((e) => e.observation_id), ["O2"]);
  assert.ok(s.all.some((e) => e.observation_id === a.observation_id));
  assert.equal(b.amends_observation_id, "O1");
});
test("AC10: amending an unknown observation throws AdapterError", () => {
  assert.throws(() => new ObservationStore().append(duplex({ amends_observation_id: "NOPE" })), AdapterError);
});
test("AC10: tampering with a copy of a stored event, or the 'all' array, cannot change the store", () => {
  const s = new ObservationStore();
  s.append(duplex()); s.append(duplex({ effective_day: 31 }));
  const copy = structuredClone(s.all[0]);
  copy.payload.velocity = 1; copy.hash = "deadbeef";
  s.all.length = 0; s.all.push(copy);
  assert.equal(s.all.length, 2);
  assert.equal(s.all[0].payload.velocity, 20);
  assert.deepEqual(s.verifyChain(), { ok: true, broken_at: null });
});
test("AC10: verifyChain ok on a normal store (stock case)", () => {
  assert.equal(runCase(byId("C05"), extrasFor("C05")).store.verifyChain().ok, true);
  assert.equal(new ObservationStore().verifyChain().ok, true);
});
test("AC10: duplicate observation_id throws", () => {
  const s = new ObservationStore();
  s.append(duplex({ observation_id: "DUP" }));
  assert.throws(() => s.append(duplex({ observation_id: "DUP", effective_day: 31 })), AdapterError);
});
test("AC10: unknown provenance throws AdapterError", () => {
  assert.throws(() => new ObservationStore().append(duplex({ provenance: "guessed" })), AdapterError);
  assert.throws(() => adapt(duplex({ provenance: undefined })), AdapterError);
});
test("AC10: mm/s converts to cm/s", () => {
  const e = new ObservationStore().append(duplex({ payload: { side: "left", velocity: 250, unit: "mm/s", direction: "anterograde" } }));
  assert.equal(e.payload.velocity, 25);
  assert.equal(e.payload.unit, "cm/s");
  assert.equal(e.quality, "VALID");
  assert.ok(e.adapter_issues.some((i) => i.code === "UNIT_CONVERTED"));
});

test("AC11: two different usable duplex values for same side and day give CONFLICT, INCOMPLETE packet, DATA_INSUFFICIENT", () => {
  const more = [duplex({ label: "L+60 days", effective_day: 60, payload: { side: "left", velocity: 25, unit: "cm/s", direction: "anterograde" } })];
  const r = runCase(byId("C05"), extrasFor("C05"), { moreObservations: more });
  assert.ok(r.quality.blocking.some((i) => i.code === "CONFLICT"));
  assert.equal(r.packet.status, "INCOMPLETE");
  assert.equal(r.packet.decision_ready, false);
  assert.equal(r.trend.state, "DATA_INSUFFICIENT");
  assert.equal(r.packet.data_quality.unresolved_conflicts, 1);
});
test("AC11: an identical duplicate is DUPLICATE, not blocking", () => {
  const more = [duplex({ label: "L+60 days", effective_day: 60, payload: { side: "left", velocity: 8.5, unit: "cm/s", direction: "anterograde" } })];
  const r = runCase(byId("C05"), extrasFor("C05"), { moreObservations: more });
  assert.ok(r.quality.issues.some((i) => i.code === "DUPLICATE"));
  assert.ok(!r.quality.blocking.some((i) => i.code === "CONFLICT"));
});
test("AC11: scan within staleDays is not stale; same scan with mission_day 80 is STALE", () => {
  const fresh = runCase(byId("C05"), extrasFor("C05"), { staleDays: 10 });
  assert.ok(!fresh.quality.issues.some((i) => i.code === "STALE"));
  const c = byId("C05"); c.inflight.mission_day = 80;
  const stale = runCase(c, extrasFor("C05"), { staleDays: 10 });
  assert.ok(stale.quality.blocking.some((i) => i.code === "STALE"));
  assert.equal(stale.packet.status, "INCOMPLETE");
  assert.equal(stale.trend.state, "DATA_INSUFFICIENT");
});

test("AC12: acceptSimulated false ignores simulated data: DATA_INSUFFICIENT and INCOMPLETE for C05", () => {
  const r = runCase(byId("C05"), extrasFor("C05"), { acceptSimulated: false });
  assert.equal(r.trend.state, "DATA_INSUFFICIENT");
  assert.equal(r.packet.status, "INCOMPLETE");
  assert.equal(r.visits.length, 0);
});
test("AC12: with acceptSimulated true (default) C05 has usable visits and is COMPLETE", () => {
  const r = runCase(byId("C05"), extrasFor("C05"));
  assert.ok(r.visits.length >= 2);
  assert.equal(r.packet.status, "COMPLETE");
});

test("AC9: C10 (no in-flight scan yet) is INCOMPLETE and not decision-ready", () => {
  const r = runCase(byId("C10"));
  assert.equal(r.packet.status, "INCOMPLETE");
  assert.equal(r.packet.decision_ready, false);
  assert.ok(r.packet.missing_or_blocking.some((m) => m.startsWith("NO_INFLIGHT_SCAN")));
});
test("AC9: symptom checklist not done today is INCOMPLETE", () => {
  const c = byId("C05"); c.symptoms.checklist_done = false;
  const r = runCase(c, extrasFor("C05"));
  assert.equal(r.packet.status, "INCOMPLETE");
  assert.ok(r.packet.missing_or_blocking.some((m) => m.startsWith("CHECKLIST_NOT_TODAY")));
});
test("AC9: every packet carries the required sections", () => {
  for (const c of CASES) {
    const p = runCase(clone(c)).packet;
    for (const k of ["engine_versions", "provenance", "data_quality", "signoff", "claim_boundaries"]) assert.ok(p[k] && Object.keys(p[k]).length > 0, `${c.id} missing ${k}`);
    assert.ok(Array.isArray(p.claim_boundaries) && p.claim_boundaries.length > 0);
    assert.equal(p.operational_use, false);
  }
});
