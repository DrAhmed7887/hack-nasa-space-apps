// AI-assisted: written with Claude Code (Anthropic) for the NASA Space Apps 2026 entry. Synthetic data only.
// Tests for spec v3.1: longitudinal states, flow-response lifecycle, data quality, packet fields, sign-off, medication, forbidden words.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const root = new URL("../../", import.meta.url);
const load = (p) => JSON.parse(readFileSync(new URL(p, root), "utf8"));
const CASES = load("data/crew_cases.json").cases;
const EXTRAS = load("site/v3_extras.json");
const clone = (x) => structuredClone(x);
const byId = (id) => clone(CASES.find((c) => c.id === id) || EXTRAS.extra_cases.find((c) => c.id === id));
const extrasFor = (id) => clone(EXTRAS.cases[id] || {});

import { runCase, SIGNOFF_DECISIONS } from "../../site/v3/pipeline.js";
import { STATES, FLOW, flowLifecycle, flowIndicated, trendState } from "../../site/v3/states.js";
import { FORBIDDEN, WARNINGS, assertNoForbidden, SafetyInterlockError } from "../../site/v3/orchestrator.js";
import { medicationReview, LANDING_LABEL } from "../../site/v3/meds.js";

const obs = (day, side, velocity, direction = "anterograde", sec = null) => ({ payload: { side, velocity, direction, sec_grade: sec }, day });
const visit = (day, l, r) => ({ day, label: `d${day}`, left: l ? obs(day, "left", ...l) : null, right: r ? obs(day, "right", ...r) : null });
const sym = { level: "none", ticked_labels: [] };

test("STATES has exactly the five v3.1 states", () => {
  assert.deepEqual(Object.keys(STATES).sort(), ["DATA_INSUFFICIENT", "DETERIORATING", "RED_FLAG_OVERRIDE", "STABLE", "WATCH"]);
});

// ---- C12 ----
test("C12: hand-scored total 6 (band 4-6 prophylactic apixaban) and DETERIORATING", () => {
  const r = runCase(byId("C12"), extrasFor("C12"));
  assert.equal(r.nasa.total, 6);
  assert.match(r.nasa.nasa_reference_band, /4-6 points = prophylactic apixaban/);
  assert.equal(r.trend.state, STATES.DETERIORATING);
  assert.equal(r.packet.longitudinal_assessment.state, STATES.DETERIORATING);
});
test("C12: an L+14 D-dimer baseline never satisfies a milestone", () => {
  const e = extrasFor("C12");
  assert.equal(e.ddimer_baseline_day, 14);
  const r = runCase(byId("C12"), e);
  assert.ok(r.timelines.laboratory.some((o) => o.effective_day === 14));
  for (const m of r.milestones.filter((x) => x.by)) assert.equal(r.store.all.find((o) => o.observation_id === m.by).observation_type, "IJV_DUPLEX_STUDY");
  assert.equal(r.milestones.find((m) => m.label === "L+60 days").satisfied, false);
});

// ---- never STABLE / WATCH rules ----
test("C09 (10 points) is never STABLE", () => {
  const r = runCase(byId("C09"));
  assert.equal(r.nasa.total, 10);
  assert.notEqual(r.trend.state, STATES.STABLE);
  assert.ok(r.trend.why.join(" ").includes(r.nasa.nasa_reference_band), "why must name the full NASA band");
});
test("C07 (day 30, single in-flight scan) is WATCH, not DETERIORATING, with the pre-flight baseline wording", () => {
  const r = runCase(byId("C07"));
  assert.equal(r.trend.state, STATES.WATCH);
  assert.match(r.trend.why.join(" "), /New in-flight finding vs the pre-flight baseline/);
});
test("trendState: STABLE only when NASA total is 0 or 1; total 2 gives at least WATCH naming the band", () => {
  const visits = [visit(0, [40], [40]), visit(30, [40], [40]), visit(60, [40], [40])];
  for (const total of [0, 1]) assert.equal(trendState({ visits, symptoms: sym, total, band: "b", blocking: [] }).state, STATES.STABLE);
  const t = trendState({ visits, symptoms: sym, total: 2, band: "BAND-X", blocking: [] });
  assert.equal(t.state, STATES.WATCH);
  assert.match(t.why.join(" "), /BAND-X/);
});
test("trendState: DETERIORATING needs forward flow on an earlier in-flight visit; baseline-only is WATCH", () => {
  const baselineOnly = [visit(0, [40], [40]), visit(30, [5], [40])];
  assert.equal(trendState({ visits: baselineOnly, symptoms: sym, total: 4, band: "b", blocking: [] }).state, STATES.WATCH);
  const serial = [visit(0, [40], [40]), visit(30, [30], [40]), visit(60, [5], [40])];
  assert.equal(trendState({ visits: serial, symptoms: sym, total: 4, band: "b", blocking: [] }).state, STATES.DETERIORATING);
});
test("trendState: blocking issue gives DATA_INSUFFICIENT but the why list still names the abnormal last scan", () => {
  const visits = [visit(0, [40], [40]), visit(30, [5], [40])];
  const t = trendState({ visits, symptoms: sym, total: 4, band: "b", blocking: [{ code: "STALE", detail: "scan overdue" }] });
  assert.equal(t.state, STATES.DATA_INSUFFICIENT);
  assert.match(t.why.join(" "), /left IJV low/);
  assert.match(t.why.join(" "), /do not read this as normal/);
});
test("trendState: emergency symptoms give RED_FLAG_OVERRIDE", () => {
  assert.equal(trendState({ visits: [], symptoms: { level: "emergency" }, total: 0, band: "b", blocking: [] }).state, STATES.RED_FLAG_OVERRIDE);
});

// ---- data quality ----
test("C04 with mission_day 146 (R-42 day 138 + 7 passed): STALE (blocking), DATA_INSUFFICIENT, why mentions retrograde", () => {
  const c = byId("C04"); c.inflight.mission_day = 146;
  const r = runCase(c, extrasFor("C04"));
  assert.ok(r.quality.blocking.some((i) => i.code === "STALE"), "expected STALE at day 146");
  assert.equal(r.trend.state, STATES.DATA_INSUFFICIENT);
  assert.match(r.trend.why.join(" "), /retrograde/);
});
test("C04: STALE fires once the next milestone (R-42, day 138) is past its 7-day window (day 146); not on day 145", () => {
  const run = (day) => { const c = byId("C04"); c.inflight.mission_day = day; return runCase(c, extrasFor("C04")); };
  assert.ok(!run(145).quality.issues.some((i) => i.code === "STALE"));
  const r = run(146);
  assert.ok(r.quality.blocking.some((i) => i.code === "STALE"));
  assert.equal(r.trend.state, STATES.DATA_INSUFFICIENT);
  assert.match(r.trend.why.join(" "), /retrograde/);
  assert.equal(r.packet.packet_status, "INCOMPLETE");
});
test("mission_day null: INCOMPLETE with MISSION_DAY_UNSET", () => {
  const c = byId("C05"); c.inflight.mission_day = null;
  const r = runCase(c, extrasFor("C05"));
  assert.ok(r.quality.blocking.some((i) => i.code === "MISSION_DAY_UNSET"));
  assert.equal(r.packet.packet_status, "INCOMPLETE");
  assert.equal(r.trend.state, STATES.DATA_INSUFFICIENT);
  assert.ok(r.packet.missing_or_blocking.some((m) => m.startsWith("MISSION_DAY_UNSET")));
});

// ---- flow lifecycle ----
const CHECKS = { thrombus_assessment: "NOT_SEEN_ON_THIS_EXAM", haemodynamics: "stable", signal_quality: "GOOD" };
const study = (o = {}) => ({ payload: { order_id: "O1", ordered_by_role: "flight surgeon", exclusions_cleared: true, exclusion_checks: CHECKS, before: { velocity: 5, direction: "anterograde" }, after: { velocity: 20, direction: "anterograde" }, ...o } });
test("flowLifecycle: every status", () => {
  assert.equal(flowLifecycle({ study: null, indicated: false, redFlag: false }).status, FLOW.NOT_INDICATED);
  assert.equal(flowLifecycle({ study: null, indicated: true, redFlag: false }).status, FLOW.INDICATED_PENDING_AUTHORIZATION);
  assert.equal(flowLifecycle({ study: study(), indicated: true, redFlag: true }).status, FLOW.LOCKED_EXCLUSION);
  const fwd = flowLifecycle({ study: study(), indicated: true, redFlag: false });
  assert.equal(fwd.status, FLOW.FORWARD_FLOW_DURING_MANEUVER);
  assert.match(fwd.note, /does not exclude thrombosis/);
  assert.equal(flowLifecycle({ study: study({ after: { velocity: 4, direction: "retrograde" } }), indicated: true, redFlag: false }).status, FLOW.NO_FORWARD_FLOW_DURING_MANEUVER);
  assert.equal(flowLifecycle({ study: study({ order_id: null }), indicated: true, redFlag: false }).status, FLOW.INCOMPLETE);
  assert.equal(flowLifecycle({ study: study({ before: { velocity: 30, direction: "anterograde" } }), indicated: true, redFlag: false }).status, FLOW.INCOMPLETE);
  assert.equal(flowLifecycle({ study: study({ after: {} }), indicated: true, redFlag: false }).status, FLOW.INCOMPLETE);
  // spec v3.1 §9.2: no result unless the exclusion checks are recorded as cleared
  const noEx = flowLifecycle({ study: study({ exclusions_cleared: undefined }), indicated: true, redFlag: false });
  assert.equal(noEx.status, FLOW.INCOMPLETE);
  assert.match(noEx.note, /Exclusion checks not recorded/);
  // the flag alone is not enough: the checks must be present and passed (review loop 3)
  assert.equal(flowLifecycle({ study: study({ exclusion_checks: undefined }), indicated: true, redFlag: false }).status, FLOW.INCOMPLETE);
  assert.equal(flowLifecycle({ study: study({ exclusion_checks: { ...CHECKS, signal_quality: "POOR" } }), indicated: true, redFlag: false }).status, FLOW.INCOMPLETE);
  assert.equal(flowLifecycle({ study: study({ exclusion_checks: { ...CHECKS, thrombus_assessment: "PRESENT" } }), indicated: true, redFlag: false }).status, FLOW.INCOMPLETE);
});
test("round-2 clinical: C06 (fall to exactly 10.0) is WATCH, never STABLE; missing SEC says 'not recorded'; >6 band keeps priority", () => {
  const c06 = runCase(byId("C06"), {});
  assert.equal(c06.trend.state, STATES.WATCH);
  assert.match(c06.trend.why.join(" "), /at NASA's threshold \(not below it\)/);
  const c01 = runCase(byId("C01"), {});
  if (c01.trend.state === STATES.STABLE) assert.match(c01.trend.why.join(" "), /left SEC not recorded, right SEC not recorded/);
  for (const id of ["C07", "C09"]) assert.match(runCase(byId(id), {}).trend.why.join(" "), /does not lower that priority/);
  const c04 = runCase(byId("C04"), extrasFor("C04"));
  assert.match(c04.trend.why.join(" "), /prophylactic apixaban consideration — clinician review required/);
  // C04 is DETERIORATING: the MTB-007 "monitor and hydrate" alternative must not be offered (review loop 3)
  assert.equal(c04.trend.state, STATES.DETERIORATING);
  assert.equal(c04.packet.nasa_score.nasa_documents_note, null);
});
test("flowIndicated: latest in-flight low/retrograde or SEC>=3; baseline-only or normal is false", () => {
  assert.equal(flowIndicated([visit(0, [5], [5])]), false);
  assert.equal(flowIndicated([visit(30, [40], [40])]), false);
  assert.equal(flowIndicated([visit(30, [5], [40])]), true);
  assert.equal(flowIndicated([visit(30, [40, "retrograde"], [40])]), true);
  assert.equal(flowIndicated([{ ...visit(30, [40], [40]), left: obs(30, "left", 40, "anterograde", 3) }]), true);
});
test("C11 flow status is LOCKED_EXCLUSION (red flag)", () => {
  const r = runCase(byId("C11"), extrasFor("C11"));
  assert.equal(r.flow.status, FLOW.LOCKED_EXCLUSION);
  assert.equal(r.packet.longitudinal_assessment.flow_response.status, FLOW.LOCKED_EXCLUSION);
});
test("C05 flow-response study is FORWARD_FLOW_DURING_MANEUVER; simulated study is ignored with acceptSimulated:false", () => {
  assert.equal(runCase(byId("C05"), extrasFor("C05")).flow.status, FLOW.FORWARD_FLOW_DURING_MANEUVER);
  const r = runCase(byId("C05"), extrasFor("C05"), { acceptSimulated: false });
  assert.notEqual(r.flow.status, FLOW.FORWARD_FLOW_DURING_MANEUVER);
  assert.ok([FLOW.NOT_INDICATED, FLOW.INDICATED_PENDING_AUTHORIZATION].includes(r.flow.status));
});

// ---- anatomy ----
test("anatomy states: flag only for confirmed DIAMETER ratio > 1.55", () => {
  const run = (a) => runCase(byId("C05"), { ...extrasFor("C05"), anatomy: a }).packet.anatomical_watchlist;
  const flag = run({ right_mm: 12, left_mm: 7, ratio_type: "DIAMETER", metric_definition_status: "CONFIRMED" });
  assert.equal(flag.state, "ANATOMICAL_SURVEILLANCE_FLAG");
  assert.equal(flag.nasa_points, 0);
  assert.equal(run({ right_mm: 12, left_mm: 7, ratio_type: "DIAMETER", metric_definition_status: "REQUIRES_PROTOCOL_CONFIRMATION" }).state, "ANATOMY_METRIC_UNRESOLVED");
  assert.equal(run({ right_mm: 12, left_mm: 7, ratio_type: "AREA", metric_definition_status: "CONFIRMED" }).state, "ANATOMY_METRIC_UNRESOLVED");
  assert.equal(run({ right_mm: 8, left_mm: 7, ratio_type: "DIAMETER", metric_definition_status: "CONFIRMED" }).state, "NO_FLAG");
  assert.equal(run({ right_mm: 10.85, left_mm: 7, ratio_type: "DIAMETER", metric_definition_status: "CONFIRMED" }).state, "NO_FLAG"); // exactly 1.55
  assert.equal(runCase(byId("C01")).packet.anatomical_watchlist, null);
  assert.equal(runCase(byId("C04"), extrasFor("C04")).packet.anatomical_watchlist.state, "ANATOMY_METRIC_UNRESOLVED");
});

// ---- packet and sign-off ----
test("packet fields: packet_id, status, comms authority, claim boundaries include every WARNING; old names are gone", () => {
  const p = runCase(byId("C05"), extrasFor("C05")).packet;
  assert.match(p.packet_id, /^VTEW-PKT-/);
  assert.equal(p.packet_status, "PENDING_CLINICAL_REVIEW");
  assert.equal(p.decision_ready, false);
  assert.equal(p.comms_profile.medication_authority, "HUMAN_FLIGHT_SURGEON_REQUIRED");
  assert.equal(WARNINGS.length, 7);
  for (const w of WARNINGS) assert.ok(p.claim_boundaries.includes(w), w);
  for (const old of ["trend_state", "anatomy", "status"]) assert.ok(!(old in p), `${old} should be renamed`);
  assert.ok("longitudinal_assessment" in p && "anatomical_watchlist" in p);
  assert.ok(p.longitudinal_assessment.flow_response);
});
test("sign-off: valid decision gives SIGNED and decision_ready; every listed decision works", () => {
  for (const decision of SIGNOFF_DECISIONS) {
    const p = runCase(byId("C05"), extrasFor("C05"), { signoff: { decision, by_role: "flight surgeon", day: 60 } }).packet;
    assert.equal(p.packet_status, "SIGNED", decision);
    assert.equal(p.decision_ready, true);
    assert.equal(p.signoff.decision, decision);
    assert.match(p.signoff.note, /audit record, not a prescription/);
  }
});
test("sign-off: invalid decision is ignored", () => {
  const p = runCase(byId("C05"), extrasFor("C05"), { signoff: { decision: "GIVE_APIXABAN", by_role: "x", day: 60 } }).packet;
  assert.equal(p.packet_status, "PENDING_CLINICAL_REVIEW");
  assert.equal(p.decision_ready, false);
  assert.equal(p.signoff.decision, null);
});
test("sign-off with a blocking issue still gives INCOMPLETE", () => {
  const p = runCase(byId("C10"), {}, { signoff: { decision: "ACKNOWLEDGED", by_role: "flight surgeon", day: 20 } }).packet;
  assert.equal(p.packet_status, "INCOMPLETE");
  assert.equal(p.decision_ready, false);
});

// ---- D-dimer near milestone ----
test("a D-dimer within 7 days of a milestone (L+25 for L+30) does not satisfy it", () => {
  const more = [{ crew_member_id: "CREW-A", observation_type: "DDIMER", label: "L+25", effective_day: 25, provenance: "measured", payload: { value: 150, unit: "ng/mL FEU" } }];
  const r = runCase(byId("C10"), {}, { moreObservations: more });
  assert.equal(r.milestones.find((m) => m.label === "L+30 days").satisfied, false);
  assert.equal(r.milestones.find((m) => m.label === "L+30 days").by, null);
});

// ---- meds ----
const review = (meds, plan = null, today = 10) => medicationReview({ meds, plan, today });
test("meds: landing PENDING without a signed plan; signed plan carries the label, 'at least' text, no_later_than_day", () => {
  assert.equal(review({ regimen: "prophylaxis" }).landing.status, "PENDING_FLIGHT_SURGEON_APPROVAL");
  const l = review({ regimen: "prophylaxis" }, { landing_day: 100, guidance_id: "MTB-007", approved_by_role: "flight surgeon" }).landing;
  assert.equal(l.status, "FROM_SIGNED_PLAN");
  assert.equal(l.hold_hours, 24);
  assert.equal(l.no_later_than_day, 99);
  assert.equal(l.label, LANDING_LABEL);
  assert.match(l.text, /at least/);
  assert.match(l.differs, /24 h for prophylaxis/);
  assert.equal(review({ regimen: "prophylaxis" }, { landing_day: 100, guidance_id: "SP-20260005258", approved_by_role: "x" }).landing.hold_hours, 48);
});
test("meds: unknown drug starts with UNRECONCILED", () => {
  assert.match(review({ regimen: "prophylaxis", concomitant: ["zzz"] }).interactions[0].flag, /^UNRECONCILED/);
});
test("meds: label 7.3 bleeding classes are flagged with source FDA-apixaban-bleeding", () => {
  const r = review({ regimen: "prophylaxis", concomitant: ["aspirin", "ibuprofen", "sertraline"] });
  for (const i of r.interactions) { assert.match(i.flag, /Interaction flagged/); assert.equal(i.source, "FDA-apixaban-bleeding"); }
});
test("meds: itraconazole with prophylaxis quotes label 7.1 'avoid coadministration'; with treatment no such note", () => {
  const p = review({ regimen: "prophylaxis", concomitant: ["itraconazole"] }).interactions[0];
  assert.match(p.dose_note, /7\.1/);
  assert.match(p.dose_note, /avoid coadministration/);
  assert.equal(review({ regimen: "treatment", concomitant: ["itraconazole"] }).interactions[0].dose_note, null);
});
test("meds: treatment adds the MTB-007 'restrict EVA and ARED for at least 30 days' entry; prophylaxis does not", () => {
  assert.ok(review({ regimen: "treatment" }).evas.some((e) => /restrict EVA and ARED for at least 30 days/.test(e.text) && e.source === "MTB-007-p12-eva"));
  assert.ok(!review({ regimen: "prophylaxis" }).evas.some((e) => /ARED/.test(e.text)));
});
test("meds: Object.hasOwn guards (regimen 'constructor' is none; drug 'toString' is UNRECONCILED)", () => {
  assert.equal(review({ regimen: "constructor" }).regimen, "none");
  assert.match(review({ regimen: "prophylaxis", concomitant: ["toString"] }).interactions[0].flag, /^UNRECONCILED/);
  assert.equal(review({ regimen: "prophylaxis" }, { landing_day: 100, guidance_id: "toString", approved_by_role: "x" }).landing.status, "PENDING_FLIGHT_SURGEON_APPROVAL");
});
test("meds: inventory (renamed from reversal_register) and notes say protamine and andexanet are not assumed available", () => {
  const r = review({ regimen: "prophylaxis", kit: [{ item: "PCC" }] });
  assert.equal(r.inventory.length, 1);
  assert.ok(!("reversal_register" in r));
  const t = r.inventory_notes.map((n) => n.text).join(" ");
  assert.match(t, /Protamine and vitamin K are not expected to affect apixaban/);
  assert.match(t, /Andexanet alfa: not assumed available/);
});

// ---- orchestrator ----
test("FORBIDDEN includes CLOT_REVERSED and AUTONOMOUS_ONBOARD_PROTOCOL_AUTHORIZED, matched as whole words", () => {
  assert.ok(FORBIDDEN.includes("CLOT_REVERSED") && FORBIDDEN.includes("AUTONOMOUS_ONBOARD_PROTOCOL_AUTHORIZED"));
  assert.throws(() => assertNoForbidden({ x: "CLOT_REVERSED" }), SafetyInterlockError);
  assert.throws(() => assertNoForbidden({ x: "AUTONOMOUS_ONBOARD_PROTOCOL_AUTHORIZED" }), SafetyInterlockError);
  assert.throws(() => assertNoForbidden({ x: "there is no clot here" }), SafetyInterlockError);
  assert.doesNotThrow(() => assertNoForbidden({ x: "a clothing note; no clothes; knoclot" }));
  assert.doesNotThrow(() => assertNoForbidden({ x: "NOT_CLOT_REVERSED_X" }));
});
