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

import { runCase, caseToObservations } from "../../site/v3/pipeline.js";
import { score } from "../../site/score.js";
import { EMERGENCY_MESSAGE } from "../../site/symptoms.js";
import { FORBIDDEN, ACTIONS, assertNoForbidden, SafetyInterlockError } from "../../site/v3/orchestrator.js";
import { STATES } from "../../site/v3/states.js";
import { readdirSync } from "node:fs";

const withExtras = (id) => runCase(byId(id), id === "C05" || id === "C11" || id === "C04" ? { ...extrasFor(id), kit: EXTRAS.kit } : {});

test("AC1: 11 stock cases exist", () => assert.equal(CASES.length, 11));
for (const c of CASES) {
  test(`AC1: Engine A parity for ${c.id}: nasa equals score(c)`, () => {
    const r = runCase(clone(c)).nasa;
    const s = score(clone(c));
    assert.equal(r.total, s.total);
    assert.equal(r.nasa_reference_band, s.nasa_reference_band);
    assert.deepEqual(r.items, s.items);
  });
}

test("AC2: C11 (vision change) gives RED_FLAG_OVERRIDE with the emergency message", () => {
  const r = runCase(byId("C11"), extrasFor("C11"));
  assert.equal(r.decision.state, STATES.RED_FLAG_OVERRIDE);
  assert.ok(r.decision.action.includes(EMERGENCY_MESSAGE));
  assert.equal(r.decision.emergency, true);
});
test("AC2: zero NASA points plus face_drooping still overrides", () => {
  const c = byId("C01");
  c.symptoms = { ticked: ["face_drooping"], sudden_or_severe: false, checklist_done: true };
  const r = runCase(c);
  assert.equal(r.nasa.total, 0);
  assert.equal(r.decision.state, STATES.RED_FLAG_OVERRIDE);
  assert.ok(r.decision.action.includes(EMERGENCY_MESSAGE));
});
test("AC2: zero NASA points plus only sudden_or_severe overrides", () => {
  const c = byId("C01");
  c.symptoms = { ticked: [], sudden_or_severe: true, checklist_done: true };
  const r = runCase(c);
  assert.equal(r.nasa.total, 0);
  assert.equal(r.decision.state, STATES.RED_FLAG_OVERRIDE);
  assert.ok(r.decision.action.includes(EMERGENCY_MESSAGE));
});
test("AC2: emergency exports the packet at once", () => {
  assert.equal(runCase(byId("C11"), extrasFor("C11")).decision.high_priority_packet, true);
});

test("AC3: an L+14 D-dimer never satisfies an ultrasound milestone", () => {
  const more = [{ crew_member_id: "CREW-A", observation_type: "DDIMER", label: "L+14", effective_day: 14, provenance: "measured", payload: { value: 150, unit: "ng/mL FEU" } }];
  const base = runCase(byId("C10"));
  const r = runCase(byId("C10"), {}, { moreObservations: more });
  assert.deepEqual(r.milestones, base.milestones);
  for (const m of r.milestones) assert.equal(m.satisfied, base.milestones.find((b) => b.label === m.label).satisfied, `${m.label} satisfaction changed by a D-dimer`);
  assert.ok(r.milestones.filter((m) => m.by).every((m) => r.store.all.find((e) => e.observation_id === m.by).observation_type === "IJV_DUPLEX_STUDY"));
});
test("AC3: a D-dimer exactly on a milestone day (L+30) still does not satisfy the milestone", () => {
  const more = [{ crew_member_id: "CREW-A", observation_type: "DDIMER", label: "L+30", effective_day: 30, provenance: "measured", payload: { value: 150, unit: "ng/mL FEU" } }];
  const r = runCase(byId("C10"), {}, { moreObservations: more });
  assert.equal(r.milestones.find((m) => m.label === "L+30 days").satisfied, false);
});

test("AC4: wearable Doppler at 2 cm/s cannot trigger NASA's <10 cm/s rule", () => {
  const base = runCase(byId("C01"));
  const more = [30, 31, 32].map((d) => ({ crew_member_id: "CREW-A", observation_type: "WEARABLE_CW_DOPPLER", label: "w", effective_day: d, provenance: "measured", source_device: "wearable", payload: { velocity: 2, unit: "cm/s", direction: null } }));
  const r = runCase(byId("C01"), {}, { moreObservations: more });
  assert.equal(r.nasa.total, base.nasa.total);
  assert.equal(r.nasa.total, score(byId("C01")).total);
  const ijv = r.nasa.items.filter((i) => /stasis|ijv|jugular/i.test(JSON.stringify(i)));
  assert.ok(ijv.every((i) => i.points === 0));
  assert.deepEqual(r.nasa.items, base.nasa.items);
  assert.equal(r.timelines.wearable_telemetry.length, 3);
});

test("AC5: C05 ratio 1.7 adds zero NASA points", () => {
  const c = byId("C05");
  const r = runCase(c, extrasFor("C05"));
  assert.equal(r.packet.anatomical_watchlist.right_to_left_ratio, 1.704); // 12.1 mm / 7.1 mm; the old 1.7 was a rounded input
  assert.equal(r.packet.anatomical_watchlist.nasa_points, 0);
  assert.equal(r.packet.anatomical_watchlist.state, "ANATOMICAL_SURVEILLANCE_FLAG");
  assert.equal(r.nasa.total, score(byId("C05")).total);
  assert.equal(r.packet.nasa_score.total, score(byId("C05")).total);
});
test("AC5: ratio exactly 1.55 says NASA does not define it", () => {
  const e = extrasFor("C04"); e.anatomy = { right_mm: 15.5, left_mm: 10, ratio_type: "DIAMETER", metric_definition_status: "CONFIRMED" };
  const r = runCase(byId("C04"), e);
  assert.equal(r.packet.anatomical_watchlist.right_to_left_ratio, 1.55);
  assert.match(r.packet.anatomical_watchlist.text, /does not define/);
  assert.equal(r.packet.anatomical_watchlist.nasa_points, 0);
});

test("AC6: assertNoForbidden passes on every packet and decision (with and without extras)", () => {
  for (const c of CASES) for (const r of [runCase(clone(c)), withExtras(c.id)]) {
    assert.doesNotThrow(() => assertNoForbidden(r.packet));
    assert.doesNotThrow(() => assertNoForbidden(r.decision));
  }
});
test("AC6: no FORBIDDEN word in any serialised packet (case-insensitive)", () => {
  for (const c of CASES) for (const r of [runCase(clone(c)), withExtras(c.id)]) {
    const text = JSON.stringify(r.packet).toLowerCase();
    for (const f of FORBIDDEN) assert.ok(!text.includes(f.toLowerCase()), `${c.id} contains ${f}`);
  }
});
test("AC6: assertNoForbidden really throws on a forbidden word", () => {
  assert.throws(() => assertNoForbidden({ x: "All clear, safe to fly" }), SafetyInterlockError);
  assert.throws(() => assertNoForbidden({ x: "THROMBOSIS_ABSENT" }), SafetyInterlockError);
});
test("AC6: positive flow response note says it does not exclude thrombosis", () => {
  const r = runCase(byId("C05"), extrasFor("C05"));
  assert.equal(r.flow.status, "FORWARD_FLOW_DURING_MANEUVER");
  assert.match(r.flow.note, /does not exclude thrombosis/);
  assert.match(r.decision.flow_response.note, /does not exclude thrombosis/);
  assert.match(r.decision.flow_response.action, /does not show lower risk/);
  assert.equal(r.packet.longitudinal_assessment.flow_response.status, "FORWARD_FLOW_DURING_MANEUVER");
});
test("AC6: flow-response study with normal 'before' flow is INCOMPLETE", () => {
  const e = extrasFor("C05");
  e.flow_response.before = { velocity: 25, direction: "anterograde" };
  const r = runCase(byId("C05"), e);
  assert.equal(r.flow.status, "INCOMPLETE");
  assert.match(r.flow.note, /no response can be judged/);
});

test("AC13: STABLE and WATCH action texts say the NASA band still applies", () => {
  assert.match(ACTIONS[STATES.STABLE], /NASA band/);
  assert.match(ACTIONS[STATES.WATCH], /NASA band/);
});
test("AC13: any STABLE/WATCH produced by a real case carries the NASA-band text", () => {
  let seen = 0;
  for (const c of CASES) for (const r of [runCase(clone(c)), withExtras(c.id)]) {
    if (r.decision.state === STATES.STABLE || r.decision.state === STATES.WATCH) { seen++; assert.match(r.decision.action, /NASA band/); }
  }
  assert.ok(seen > 0, "expected at least one STABLE or WATCH case");
});

test("AC8: no v3 file uses network APIs", () => {
  const dir = new URL("site/v3/", root);
  const files = readdirSync(dir).filter((f) => f.endsWith(".js"));
  assert.ok(files.length >= 7);
  for (const f of files) {
    const t = readFileSync(new URL(f, dir), "utf8");
    for (const bad of ["fetch(", "XMLHttpRequest", "WebSocket"]) assert.ok(!t.includes(bad), `${f} contains ${bad}`);
    assert.ok(!/import\s*\(\s*["'`]https?:/.test(t), `${f} has remote dynamic import`);
    assert.ok(!/import\s*\([^)]*https?:/.test(t), `${f} has remote dynamic import`);
  }
});
test("AC8: caseToObservations is exported (sanity)", () => assert.equal(typeof caseToObservations, "function"));
