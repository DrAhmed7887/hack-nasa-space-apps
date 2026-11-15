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

import { runCase } from "../../site/v3/pipeline.js";
import { medicationReview, LANDING_LABEL } from "../../site/v3/meds.js";

test("AC7: C04 (plan null) has no landing countdown: PENDING_FLIGHT_SURGEON_APPROVAL", () => {
  const r = runCase(byId("C04"), extrasFor("C04"));
  assert.equal(r.meds.landing.status, "PENDING_FLIGHT_SURGEON_APPROVAL");
  assert.ok(!("hold_from_day" in r.meds.landing));
  assert.equal(r.packet.medication.landing.status, "PENDING_FLIGHT_SURGEON_APPROVAL");
});
test("AC7: a plan without approval gives no countdown", () => {
  const e = extrasFor("C05"); delete e.plan.approved_by_role;
  assert.equal(runCase(byId("C05"), e).meds.landing.status, "PENDING_FLIGHT_SURGEON_APPROVAL");
});
test("AC7: a plan with unknown guidance_id gives no countdown", () => {
  const e = extrasFor("C05"); e.plan.guidance_id = "MADE-UP";
  assert.equal(runCase(byId("C05"), e).meds.landing.status, "PENDING_FLIGHT_SURGEON_APPROVAL");
});
test("AC7: C05 prophylaxis with MTB-007 guidance holds 24 h from day 179", () => {
  const l = runCase(byId("C05"), extrasFor("C05")).meds.landing;
  assert.equal(l.status, "FROM_SIGNED_PLAN");
  assert.equal(l.hold_hours, 24);
  assert.equal(l.no_later_than_day, 179);
  assert.equal(l.label, LANDING_LABEL);
  assert.match(l.text, /at least/);
  assert.match(l.differs, /differ/);
});
test("AC7: C05 with guidance SP-20260005258 holds 48 h", () => {
  const e = extrasFor("C05"); e.plan.guidance_id = "SP-20260005258";
  const l = runCase(byId("C05"), e).meds.landing;
  assert.equal(l.hold_hours, 48);
  assert.equal(l.no_later_than_day, 178);
});
test("AC7: itraconazole is flagged as an interaction", () => {
  const i = runCase(byId("C05"), extrasFor("C05")).meds.interactions;
  const it = i.find((x) => x.drug === "itraconazole");
  assert.match(it.flag, /Interaction flagged/);
});
test("AC7: an unknown drug is not reported as 'no interaction'", () => {
  const r = medicationReview({ meds: { regimen: "prophylaxis", concomitant: ["zzz_unknown"] }, plan: null, today: 10 });
  assert.match(r.interactions[0].flag, /not a statement that there is no interaction/);
  assert.equal(r.interactions[0].class, null);
});
test("AC7: medication output never contains dose instructions and always needs sign-off", () => {
  for (const id of ["C04", "C05", "C11"]) {
    const r = runCase(byId(id), { ...extrasFor(id), kit: EXTRAS.kit });
    const t = JSON.stringify(r.meds).toLowerCase();
    for (const bad of ["start apixaban", "stop apixaban now", "give reversal", "increase the dose", "reduce the dose"]) assert.ok(!t.includes(bad), `${id}: ${bad}`);
    assert.equal(r.meds.signoff_required, true);
  }
  for (const regimen of ["none", "prophylaxis", "treatment", undefined]) assert.equal(medicationReview({ meds: { regimen }, plan: null, today: 1 }).signoff_required, true);
  assert.equal(medicationReview({ meds: undefined, plan: undefined, today: undefined }).signoff_required, true);
});
test("AC7: no apixaban recorded means landing hold NOT_APPLICABLE", () => {
  assert.equal(runCase(byId("C11"), extrasFor("C11")).meds.landing.status, "NOT_APPLICABLE");
});
test("AC9: signoff defaults to no decision", () => {
  assert.equal(runCase(byId("C05"), extrasFor("C05")).packet.signoff.decision, null);
});
