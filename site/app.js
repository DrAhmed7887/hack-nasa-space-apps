// AI-assisted: written with Claude Code (Anthropic) for the NASA Space Apps 2026 entry. Synthetic data only.
// UI for the VTE score calculator, the v3 clinical engine panel and the flight-surgeon packet. The score comes from score.js (port of vte/score.py).
import { SYMPTOMS, assess, emptyReport } from "./symptoms.js";
import { classify, ijvFromScans, latestInFlight, trendRows, FORWARD, LOW, RETRO, NOT_MEASURED, TREND_NOTE } from "./trend.js";
import { score, scanSchedule, nextScan, reviewContext, fmtSeconds, MISSIONS, SOURCES, InputError } from "./score.js";
import { runCase, packetSummary, SIGNOFF_DECISIONS } from "./v3/pipeline.js";
import { V3_SOURCES } from "./v3/sources.js";

const APP_NAME = "VTE Watch"; // working name: change it here only
const DEFAULT_CASE = "C05";
const DEFAULT_MISSION = "mars";

const $ = (id) => document.getElementById(id);
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === "class") e.className = v;
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat(Infinity)) if (k != null) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
}

document.title = APP_NAME;
$("app-name").textContent = APP_NAME;

const state = { extras: {}, stock: {}, caseId: null, stockSig: null, mission: DEFAULT_MISSION, scans: [], slot: 1, signoff: null };

const blankSide = () => ({ mean_peak_velocity_cm_s: null, direction: null });
const DEFAULT_SCANS = [["Baseline", 0, false, true], ["L+30 days", 30, true, false], ["L+60 days", 60, true, false], ["R-42 days", 138, true, false]]
  .map(([label, day, in_flight, recorded]) => ({ label, day, in_flight, recorded, left: blankSide(), right: blankSide() }));

// The form's IJV fields describe one scan slot: the newest recorded in-flight scan, else the first in-flight slot.
function slotIndex(scans) {
  let idx = -1;
  scans.forEach((sc, i) => { if (sc.in_flight && sc.recorded && (classify(sc.left) !== NOT_MEASURED || classify(sc.right) !== NOT_MEASURED)) idx = i; });
  if (idx >= 0) return idx;
  const first = scans.findIndex((sc) => sc.in_flight);
  return first >= 0 ? first : 0;
}

function readSymptoms() {
  return {
    ticked: [...document.querySelectorAll('input[name="sym"]:checked')].map((x) => x.value),
    sudden_or_severe: $("sym-severe").checked,
    checklist_done: $("sym-done").checked,
  };
}
function fillSymptoms(r) {
  r = r || emptyReport();
  document.querySelectorAll('input[name="sym"]').forEach((x) => (x.checked = (r.ticked || []).includes(x.value)));
  $("sym-severe").checked = !!r.sudden_or_severe;
  $("sym-done").checked = !!r.checklist_done;
}

// ---------- form <-> case ----------
const numOrNull = (id) => {
  const v = $(id).value.trim();
  if (v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function readForm() {
  const c = {
    preflight: {
      age: numOrNull("age"),
      family_history: $("family").value,
      thrombophilia: [...document.querySelectorAll('input[name="thr"]:checked')].map((x) => x.value).sort(),
      abo_non_o: $("abo").checked,
      hormone: $("hormone").value,
    },
    mission_days: numOrNull("mission_days"),
    inflight: { mission_day: numOrNull("mission_day"), ddimer_baseline: numOrNull("ddb"), ddimer_now: numOrNull("ddn") },
    scans: structuredClone(state.scans),
    symptoms: readSymptoms(),
  };
  if ($("noscan").checked) {
    for (const sc of c.scans) if (sc.in_flight) Object.assign(sc, { recorded: false, left: blankSide(), right: blankSide() });
  } else {
    const sc = c.scans[state.slot];
    let any = false;
    for (const side of ["left", "right"]) {
      const v = numOrNull(side + "_v");
      const r = $(side + "_r").checked;
      sc[side] = v !== null || r ? { mean_peak_velocity_cm_s: v, direction: r ? "retrograde" : "anterograde" } : blankSide();
      any = any || v !== null || r;
    }
    if (!any) {
      throw new InputError("Enter at least one IJV velocity, tick retrograde flow, or tick \"No in-flight IJV ultrasound yet\".");
    }
    sc.recorded = true;
  }
  return c;
}

function fillForm(c) {
  const p = c.preflight, f = c.inflight || {};
  const set = (id, v) => ($(id).value = v == null ? "" : v);
  set("age", p.age);
  $("family").value = p.family_history || "none";
  document.querySelectorAll('input[name="thr"]').forEach((x) => (x.checked = (p.thrombophilia || []).includes(x.value)));
  $("abo").checked = !!p.abo_non_o;
  $("hormone").value = p.hormone || "none";
  set("mission_days", c.mission_days);
  set("mission_day", f.mission_day);
  state.scans = structuredClone(c.scans || DEFAULT_SCANS);
  state.slot = slotIndex(state.scans);
  $("noscan").checked = ijvFromScans(state.scans) === null;
  for (const side of ["left", "right"]) {
    const s = state.scans[state.slot][side];
    set(side + "_v", s ? s.mean_peak_velocity_cm_s : null);
    $(side + "_r").checked = !!(s && s.direction === "retrograde");
  }
  fillSymptoms(c.symptoms);
  set("ddb", f.ddimer_baseline);
  set("ddn", f.ddimer_now);
  syncIjvDisabled();
}

function syncIjvDisabled() {
  const off = $("noscan").checked;
  $("ijv-fields").querySelectorAll("input").forEach((i) => (i.disabled = off));
}

const sig = (c) => JSON.stringify(c);

// ---------- helpers ----------
function fmtValue(v) {
  if (v === null || v === undefined) return "not provided";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "none";
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v);
}
const sourceLink = (id) => {
  const s = SOURCES[id];
  return s ? h("a", { href: s.url, target: "_blank", rel: "noopener" }, id) : id;
};
function fmtClock(s) {
  const d = Math.floor(s / 86400);
  const r = s - d * 86400;
  const pad = (n) => String(Math.floor(n)).padStart(2, "0");
  return `Day ${d}, ${pad(r / 3600)}:${pad((r % 3600) / 60)}:${pad(r % 60)}`;
}
const fmtInt = (n) => Number(n).toLocaleString("en-US");

// ---------- render ----------
let lastScore = null;

function render() {
  let c, res = null;
  const errBox = $("score-error");
  try {
    c = readForm();
    res = score(c);
    errBox.hidden = true;
  } catch (e) {
    errBox.hidden = false;
    errBox.textContent = e instanceof InputError ? `Cannot score this input: ${e.message}` : "Something went wrong reading the form. Check the values.";
    if (!(e instanceof InputError)) console.warn(e);
  }
  lastScore = res;
  renderScore(res);
  $("score-safety").replaceChildren(SAFETY_SCORE, h("br"), SAFETY_SINUS);
  renderSymptoms(c, res);
  renderTrend(c, res);
  renderSchedule(c, res);
  renderMission(c, res);
  renderV3(c, res);
  syncUrl();
}

function renderScore(res) {
  const out = $("score-out");
  out.replaceChildren();
  if (!res) return;
  out.append(
    h("div", { class: "total" },
      h("div", { class: "big", "aria-label": `Total ${res.total} points` }, String(res.total), h("small", {}, `point${res.total === 1 ? "" : "s"} (pre-flight ${res.preflight_points}, in-flight ${res.inflight_points})`)),
      h("div", { class: "band" }, h("div", { class: "k" }, "NASA reference band (for clinician review)"), h("div", { class: "v" }, res.nasa_reference_band)))
  );
  out.append(
    h("ul", { class: "items" }, res.items.map((i) =>
      h("li", {},
        h("span", { class: "g" }, i.group),
        h("span", { class: "pts" + (i.points ? "" : " zero") }, i.points ? `+${i.points}` : "0"),
        h("blockquote", { class: "rule" }, i.rule),
        h("span", { class: "meta" }, "Input: ", fmtValue(i.value), " · Source: ", sourceLink(i.source)))))
  );
  if (res.flags.length) out.append(h("ul", { class: "flags", "aria-label": "Review flags" }, res.flags.map((f) => h("li", {}, f))));
  out.append(h("p", { class: "hint" }, res.note));
}

const SAFETY_SCORE = "The risk score is not a diagnostic test. New symptoms need their own assessment whatever the score.";
const SAFETY_SINUS = "The NASA jugular ultrasound protocol does not exclude a clot in the brain's venous sinuses.";
const SAFETY_DELAY = "One-way delay is not clinical response time: a reply also needs a person to read, decide and answer.";

function renderSymptoms(c, res) {
  const out = $("sym-out");
  out.replaceChildren();
  if (!c) return;
  const a = assess(c.symptoms);
  out.append(
    h("p", { class: "sym-msg " + a.level }, a.message),
    h("p", { class: "hint" }, a.ticked.length ? `Reported: ${a.ticked_labels.join("; ")}${a.sudden_or_severe ? "; marked sudden or severe" : ""}.` : (a.sudden_or_severe ? "Marked sudden or severe." : "No symptom ticked."),
      res ? ` The NASA score above stays at ${res.total} point${res.total === 1 ? "" : "s"}: symptoms add none.` : ""));
}

const LABEL_CLASS = { [FORWARD]: "fwd", [LOW]: "low", [RETRO]: "ret", [NOT_MEASURED]: "nm" };
function sideDetail(sc, side) {
  const x = sc[side] || {};
  if (!sc.recorded) return "";
  const v = x.mean_peak_velocity_cm_s ?? null;
  return [v !== null ? `${v} cm/s` : null, x.direction].filter(Boolean).join(", ");
}

function renderTrend(c, res) {
  const out = $("trend-out");
  out.replaceChildren();
  if (!c) return;
  const rows = trendRows(c.scans);
  const latest = latestInFlight(c.scans);
  out.append(
    h("ul", { class: "trend" }, c.scans.map((sc, i) => {
      const r = rows[i];
      return h("li", { class: sc === latest ? "scored" : "" },
        h("span", { class: "when" }, sc.label, sc.in_flight ? "" : " (pre-flight)"),
        sc === latest ? h("span", { class: "tagx" }, "Used for the score") : null,
        ["left", "right"].map((side) => h("span", { class: "side " + LABEL_CLASS[r[side]] }, h("b", {}, side + " IJV"), r[side], sideDetail(sc, side) ? h("small", {}, h("br"), sideDetail(sc, side)) : null)));
    })),
    velocityChart(c.scans),
    h("p", { class: "hint" }, TREND_NOTE, " Colour is only a hint; the words carry the meaning."),
    h("p", { class: "hint" }, res ? `The score's IJV row (${res.items.find((i) => i.group === "IJV flow").points ? "+4" : "0"}) is read from the scan marked above: the same latest recorded in-flight scan.` : ""));
}

// Left IJV mean peak velocity per recorded duplex exam, with NASA's 10 cm/s line (SP-20260005258 REV1 p.20).
// Drawing only: the label for each scan still comes from trend.js, and the score reads only the latest in-flight scan.
function velocityChart(scans) {
  const pts = scans
    .filter((sc) => sc.recorded && typeof sc.left?.mean_peak_velocity_cm_s === "number")
    .map((sc) => ({ day: sc.day, v: sc.left.mean_peak_velocity_cm_s, retro: sc.left.direction === "retrograde", label: sc.label.split(" (")[0], pre: !sc.in_flight }));
  if (pts.length < 2) return null;
  const W = 520, H = 210, L = 44, R = 16, T = 18, B = 40;
  const hi = Math.max(40, Math.ceil(Math.max(...pts.map((p) => p.v)) / 10) * 10);
  const d0 = Math.min(...pts.map((p) => p.day)), d1 = Math.max(...pts.map((p) => p.day));
  const x = (d) => L + (W - L - R) * ((d - d0) / ((d1 - d0) || 1));
  const y = (v) => T + (H - T - B) * (1 - v / hi);
  const g = [];
  for (let t = 0; t <= hi; t += 10) {
    g.push(svg("line", { x1: L, x2: W - R, y1: y(t), y2: y(t), stroke: "var(--line-2)", "stroke-width": 1, opacity: 0.5 }),
      svg("text", { x: L - 6, y: y(t) + 4, "text-anchor": "end", fill: "var(--muted)", "font-size": 11 }, String(t)));
  }
  g.push(
    svg("rect", { x: L, y: y(10), width: W - L - R, height: y(0) - y(10), fill: "var(--warn-line)", opacity: 0.18 }),
    svg("line", { x1: L, x2: W - R, y1: y(10), y2: y(10), stroke: "var(--warn-ink)", "stroke-width": 2, "stroke-dasharray": "6 4" }),
    svg("text", { x: L + 6, y: y(10) - 6, "text-anchor": "start", fill: "var(--warn-ink)", "font-size": 12, "font-weight": 600 }, "10 cm/s: NASA duplex criterion"),
    svg("polyline", { points: pts.map((p) => `${x(p.day)},${y(p.v)}`).join(" "), fill: "none", stroke: "var(--accent)", "stroke-width": 2.5 }),
    svg("text", { x: 4, y: T - 6, fill: "var(--muted)", "font-size": 11 }, "cm/s"));
  pts.forEach((p) => {
    const below = p.v < 10 || p.retro;
    const anchor = x(p.day) < L + 30 ? "start" : x(p.day) > W - R - 30 ? "end" : "middle";
    g.push(
      svg("circle", { cx: x(p.day), cy: y(p.v), r: 6, fill: below ? "var(--warn-ink)" : "var(--ink)", stroke: "var(--accent)", "stroke-width": 2 }),
      svg("text", { x: x(p.day), y: below ? y(p.v) + 22 : y(p.v) - 11, "text-anchor": anchor, fill: "var(--ink)", "font-size": 12, "font-weight": 600 }, `${p.v.toFixed(1)} cm/s${p.retro ? " retrograde" : ""}`),
      svg("text", { x: x(p.day), y: H - 20, "text-anchor": anchor, fill: "var(--muted)", "font-size": 11 }, p.label + (p.pre ? " (pre-flight)" : "")));
  });
  const n = pts.length;
  const desc = `Synthetic left IJV mean peak velocity from ${n} examinations: ${pts.map((p) => `${p.label} ${p.v} cm/s`).join(", ")}. Dashed line: NASA's 10 cm/s duplex criterion.`;
  return h("figure", { class: "vel" },
    svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": desc, class: "i4-svg" }, svg("title", {}, desc), g),
    h("figcaption", { class: "hint" }, `Synthetic left IJV velocity observations from ${n === 3 ? "three" : n} examinations. The 10 cm/s reference is the NASA duplex criterion (`, sourceLink("VTE-2026"), ", p.20). Only the latest in-flight exam feeds NASA's score; the line is a review cue, not a diagnosis."));
}

function renderSchedule(c, res) {
  const out = $("sched-out");
  out.replaceChildren();
  try {
    if (!c) throw new InputError("Fix the input above to see the schedule.");
    const rows = scanSchedule(c.mission_days);
    const day = c.inflight.mission_day;
    const nxt = Number.isInteger(day) ? nextScan(c.mission_days, day) : null;
    out.append(
      h("p", {}, `Mission length ${c.mission_days} days, mission day ${day ?? "not set"}. IJV ultrasound, example schedule from `, sourceLink("MTB-007"), "."),
      h("ul", { class: "sched" }, rows.map((r) => h("li", { class: nxt && nxt.day === r.day ? "next" : "" }, nxt && nxt.day === r.day ? h("span", { class: "tag" }, "Next scan") : null, `${r.label} (mission day ${r.day})`))),
      h("p", { class: "hint" }, nxt ? `Next scan: ${nxt.label}, mission day ${nxt.day}.` : "No scheduled scan left on or after the current mission day.")
    );
  } catch (e) {
    out.append(h("p", { class: "error" }, e instanceof InputError ? e.message : "Could not build the schedule."));
  }
}

// ---------- 7. mission context (latency only; the score never changes with distance) ----------
function renderMission(c, res) {
  const out = $("mission-out");
  out.replaceChildren();
  const ctx = reviewContext(state.mission);
  out.append(
    h("dl", { class: "ctx" },
      [["Destination", ctx.name], ["Communication", ctx.communication], ["Evacuation", ctx.evacuation], ["Ground support", ctx.ground_support],
       ["Simulated one-way delay", `${fmtSeconds(ctx.simulated_one_way_delay_s)} (simulation; ${ctx.delay_basis})`], ["Earliest ground reply", fmtSeconds(ctx.earliest_ground_reply_s)]]
        .map(([k, v]) => h("div", {}, h("dt", {}, k), h("dd", {}, v)))),
    h("p", { class: "hint" }, SAFETY_DELAY),
    h("p", { class: "hint" }, "Every safety check below runs onboard, in this page, with no network. The packet waits in the outbox until the link is up; nothing onboard waits for a ground reply."),
    h("p", { class: "hint" }, "Sources: ", ctx.sources.map((s, i) => [i ? ", " : "", sourceLink(s)])));
  if (res) {
    out.append(h("div", { class: "same", "aria-label": "Score by mission" },
      Object.keys(MISSIONS).map((m) => h("span", { class: m === state.mission ? "on" : "" }, `${MISSIONS[m].name}: ${res.total} point${res.total === 1 ? "" : "s"}, ${res.nasa_reference_band.split(" = ")[1] || "no band"}`))));
  }
}

// ---------- 8. clinical engine (spec v3.1) ----------
const STATE_CLASS = { RED_FLAG_OVERRIDE: "emergency", DETERIORATING: "report_today", WATCH: "report_today", STABLE: "none_reported", DATA_INSUFFICIENT: "not_done" };
const v3src = (id) => {
  if (!id || !Object.hasOwn(V3_SOURCES, id)) return "";
  const s = V3_SOURCES[id];
  return s.url ? h("a", { href: s.url, target: "_blank", rel: "noopener", title: s.quote }, s.doc) : s.doc;
};
let lastRun = null;

// Scenario extras belong to a stock case only while it is unedited; an edited case is "custom" and gets none.
function activeExtras() {
  if (!state.caseId || !currentSigMatches()) return {};
  const x = Object.hasOwn(state.extras.cases || {}, state.caseId) ? { ...state.extras.cases[state.caseId] } : {};
  x.meds = { ...(x.meds || { regimen: "none" }), kit: state.extras.kit || [] };
  return x;
}

function renderV3(c, res) {
  const out = $("v3-out");
  out.replaceChildren();
  lastRun = null;
  if (!c || !res) { out.append(h("p", { class: "hint" }, "Fix the case input above to run the clinical engine.")); return; }
  const stock = !!state.caseId && currentSigMatches();
  let r;
  try {
    r = runCase(c, activeExtras(), { signoff: state.signoff, mission: state.mission });
  } catch (e) {
    out.append(h("p", { class: "error" }, `Clinical engine stopped safely: ${e.message}`));
    return;
  }
  lastRun = r;
  const p = r.packet, d = p.longitudinal_assessment, fr = d.flow_response;
  const item = (k, ...v) => h("li", {}, h("b", {}, k), ...v);
  const nodes = [
    h("p", { class: "sym-msg " + (STATE_CLASS[d.state] || "") }, h("b", {}, d.state.replaceAll("_", " ")), ": ", d.action),
    h("ul", { class: "hint" }, d.why.map((w) => h("li", {}, w))),
    ...(p.nasa_score.nasa_documents_note ? [h("p", { class: "notice" }, p.nasa_score.nasa_documents_note)] : []),
    h("p", { class: "notice" }, h("b", {}, `Venous Flow Response Assessment: ${fr.status.replaceAll("_", " ")}. `),
      fr.before ? `Order ${fr.order_id} (${fr.ordered_by_role}, ${fr.protocol}): ${fr.before} → ${fr.after}. ` : "", fr.note || "", fr.action ? ` ${fr.action}` : ""),
    h("p", { class: "hint" }, "Bounded states, never a score: NASA's points above are unchanged by anything in this panel. Trend rules are the team's (PROPOSED_LOCAL), not clinically validated."),
  ];
  if (!stock && state.caseId) nodes.push(h("p", { class: "hint" }, "Custom (edited) case: scenario extras such as SEC grades, medication and the landing plan are not applied."));
  out.append(...nodes);

  const tl = r.timelines;
  const rowsFor = (k) => tl[k].map((e) => {
    const pl = e.payload;
    const val = e.observation_type === "IJV_DUPLEX_STUDY" ? `${pl.side} ${pl.velocity ?? "–"} cm/s ${pl.direction || ""}${pl.sec_grade ? ` · SEC ${pl.sec_grade}` : ""}`
      : e.observation_type === "DDIMER" ? `${pl.value} ${pl.unit}`
      : e.observation_type === "WEARABLE_CW_DOPPLER" ? `${pl.velocity} cm/s (trend only, not diagnostic)`
      : e.observation_type === "FLOW_RESPONSE_STUDY" ? `before ${pl.before?.velocity} → after ${pl.after?.velocity} cm/s`
      : (pl.ticked || []).length ? `${pl.ticked.length} ticked` : "none ticked";
    return h("tr", {}, h("td", {}, e.effective_day ?? "day not recorded"), h("td", {}, e.label || e.observation_type), h("td", {}, val), h("td", {}, e.provenance), h("td", {}, e.quality), h("td", { class: "mono" }, e.observation_id));
  });
  out.append(h("h3", {}, "Four separate timelines (append-only record)"),
    ...["ultrasound", "laboratory", "wearable_telemetry", "symptom"].map((k) => h("details", { open: k === "ultrasound" ? true : null },
      h("summary", {}, `${k.replace("_", " ")} (${tl[k].length})`),
      tl[k].length ? h("div", { class: "i4-tablewrap" }, h("table", { class: "i4-table" },
        h("thead", {}, h("tr", {}, ["Mission day", "What", "Value", "Provenance", "Quality", "ID"].map((x) => h("th", { scope: "col" }, x)))),
        h("tbody", {}, rowsFor(k)))) : h("p", { class: "hint" }, k === "wearable_telemetry" ? "No entries. A missing wearable signal is not evidence of normal flow." : "No entries. Nothing is filled in between scans."),
      k === "wearable_telemetry" && tl[k].length ? h("p", { class: "hint" }, "Wearable Doppler is not validated against the NASA duplex threshold in this application: trend only, never used for NASA's <10 cm/s rule.") : null)),
    h("p", { class: "hint" }, "Scan milestones (only a duplex ultrasound study can meet one): ",
      r.milestones.map((m, i) => [i ? " · " : "", `${m.label}: ${m.satisfied ? "met" : "open"}`])));

  const an = p.anatomical_watchlist;
  if (an) out.append(h("p", { class: "notice" }, h("b", {}, `Jugular anatomy watchlist${an.right_to_left_ratio !== null ? ` (R:L ${an.ratio_type ? an.ratio_type.toLowerCase() : ""} ratio ${an.right_to_left_ratio})` : ""}: `), an.text, " ", an.caveat, " Source: ", v3src(an.source), "."));

  const m = p.medication;
  out.append(h("h3", {}, "Medication safety and landing (every change needs flight-surgeon sign-off)"),
    h("ul", { class: "pkt" },
      item("Recorded regimen", `${m.regimen_label}${m.recorded_by_role ? ` (recorded by ${m.recorded_by_role})` : ""}. `, v3src(m.regimen_source)),
      item("Landing", m.landing.label ? h("b", {}, m.landing.label, " ") : "", m.landing.text, m.landing.days_until != null ? (m.landing.days_until >= 0 ? ` Days until that point: ${m.landing.days_until}.` : " That day has already passed: the flight surgeon reviews the plan.") : "", m.landing.differs ? ` ${m.landing.differs}` : "", m.landing.source ? [" ", v3src(m.landing.source)] : ""),
      ...m.evas.map((x) => item("EVA", x.text, " ", v3src(x.source))),
      ...(m.eva_dcs_context ? [item("EVA medicines and DCS (context, no rule)", m.eva_dcs_context.text, " ", v3src(m.eva_dcs_context.source))] : []),
      ...m.interactions.map((x) => item(`Interaction check: ${x.drug.replaceAll("_", " ")}`, `${x.class ? x.class + ", " + x.effect + ". " : ""}${x.flag} ${x.dose_note || ""} `, v3src(x.source))),
      item("Bleeding context", m.bleeding_context.text, " ", v3src(m.bleeding_context.source)),
      item("Bleeding-management inventory", m.inventory.length ? m.inventory.map((k) => `${k.item} ×${k.quantity} (exp. ${k.expires}): ${k.note}`).join(" ") : "No kit items recorded.", " ",
        m.inventory_notes.map((n, i) => [i ? " " : "", n.text, n.source ? [" ", v3src(n.source)] : ""]))),
    h("p", { class: "hint" }, "The app never starts, stops, holds, doses, restarts or reverses a medicine. It shows NASA and FDA reference text and flags what the flight surgeon must review."));

  const dq = p.data_quality;
  out.append(h("h3", {}, "Data quality, provenance and the Flight-Surgeon Packet"),
    h("p", { class: p.packet_status === "INCOMPLETE" ? "error" : "hint" }, `Packet ${p.packet_id}: ${p.packet_status.replaceAll("_", " ")}. `,
      p.packet_status === "INCOMPLETE" ? `Not decision-ready: ${p.missing_or_blocking.join("; ")}.` : p.packet_status === "SIGNED" ? "Signed (simulation; never operational)." : "No blocking data gaps found by the configured checks; awaiting flight-surgeon review."),
    h("p", { class: "hint" }, `Provenance: ${Object.entries(p.provenance).map(([k, v]) => `${k} ${v}`).join(", ")}. Audit chain ${dq.audit_chain.ok ? "intact" : "BROKEN at " + dq.audit_chain.broken_at}. Unresolved conflicts: ${dq.unresolved_conflicts}. Ground review: ${p.comms_profile.ground_review_mode.toLowerCase()}, medication authority: human flight surgeon.`),
    h("details", {}, h("summary", {}, `Data-quality notes (${dq.issues.length})`), h("ul", { class: "hint" }, dq.issues.map((i) => h("li", {}, `${i.code}${i.blocking ? " (blocking)" : ""}: ${i.detail}`)))),
    h("div", { class: "flight-bar" },
      h("label", { for: "v3-decision" }, "Flight-surgeon decision (simulation) "),
      h("select", { id: "v3-decision", disabled: p.packet_status === "INCOMPLETE" ? true : null }, ["", ...SIGNOFF_DECISIONS].map((x) => h("option", { value: x, selected: (state.signoff?.decision || "") === x ? true : null }, x ? x.replaceAll("_", " ").toLowerCase() : "not signed"))),
      h("button", { type: "button", id: "v3-json" }, "Download packet (JSON)"),
      h("button", { type: "button", id: "v3-print" }, "Print one-page summary")),
    h("p", { class: "hint" }, "A sign-off decision is an audit record, not a prescription. Editing any input clears it."),
    h("ol", { class: "hint", id: "v3-summary" }, packetSummary(p).map((l) => h("li", {}, l))));
  $("v3-decision").addEventListener("change", (ev) => {
    const v = ev.target.value;
    state.signoff = v ? { decision: v, by_role: "flight surgeon (simulation)", day: c.inflight.mission_day } : null;
    render();
  });
  $("v3-json").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(lastRun.packet, null, 1)], { type: "application/json" });
    const a = h("a", { href: URL.createObjectURL(blob), download: `vte-watch-packet-${stock ? state.caseId : "custom"}.json` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 0);
  });
  $("v3-print").addEventListener("click", () => window.print());
}

// ---------- URL, init ----------
function syncUrl() {
  try {
    const u = new URL(location.href);
    if (state.caseId && currentSigMatches()) u.searchParams.set("case", state.caseId); else u.searchParams.delete("case");
    u.searchParams.set("mission", state.mission);
    history.replaceState(null, "", u);
  } catch { /* file:// or sandboxed: ignore */ }
}
function currentSigMatches() {
  try { return sig(readForm()) === state.stockSig; } catch { return false; }
}

function selectCase(id) {
  const c = state.stock[id];
  if (!c) return;
  state.caseId = id;
  $("case-pick").value = id;
  fillForm(c);
  state.stockSig = sig(readForm());
  $("case-note").textContent = `Stock case ${id}. Editing any field makes it a custom case.`;
}

function setMission(m) {
  state.mission = m;
  document.querySelectorAll('input[name="mission"]').forEach((r) => (r.checked = r.value === m));
}

function onEdit() {
  state.signoff = null; // a signature never carries over to data the flight surgeon has not seen
  if (state.caseId && !currentSigMatches()) {
    $("case-note").textContent = `Custom case (edited from ${state.caseId}).`;
  } else if (state.caseId) {
    $("case-note").textContent = `Stock case ${state.caseId}. Editing any field makes it a custom case.`;
  }
  render();
}

// ---------- Inspiration4 context (group summaries only; never used by the score) ----------
const SVGNS = "http://www.w3.org/2000/svg";
function svg(tag, attrs, ...kids) {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, String(v));
  for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
}
const fmtNum = (v) => Number(v).toLocaleString("en-US");

function i4Chart(a, tps) {
  const W = 420, H = 160, L = 8, R = 8, T = 14, B = 34;
  const pts = a.points;
  const lo = Math.min(...pts.map((p) => p.min)), hi = Math.max(...pts.map((p) => p.max));
  const pad = (hi - lo) * 0.08 || 1;
  const y = (v) => T + (H - T - B) * (1 - (v - (lo - pad)) / (hi - lo + 2 * pad));
  const x = (i) => L + ((W - L - R) * (i + 0.5)) / pts.length;
  const split = x(2) + (x(3) - x(2)) / 2; // between L-3 and R+1
  const g = [
    svg("line", { x1: split, x2: split, y1: T - 6, y2: H - B + 6, stroke: "var(--line-2)", "stroke-dasharray": "4 4" }),
    svg("text", { x: split, y: 9, "text-anchor": "middle", fill: "var(--muted)", "font-size": 11 }, "flight: no draws"),
  ];
  pts.forEach((p, i) => {
    g.push(
      svg("line", { x1: x(i), x2: x(i), y1: y(p.max), y2: y(p.min), stroke: "var(--accent)", "stroke-width": 7, "stroke-linecap": "round", opacity: 0.45 }),
      svg("circle", { cx: x(i), cy: y(p.mean), r: 5, fill: "var(--ink)", stroke: "var(--accent)", "stroke-width": 2 }),
      svg("text", { x: x(i), y: H - 16, "text-anchor": "middle", fill: "var(--muted)", "font-size": 11 }, p.timepoint));
  });
  g.push(
    svg("text", { x: L, y: H - 2, fill: "var(--muted)", "font-size": 11 }, `axis ${fmtNum(lo)} to ${fmtNum(hi)}`));
  const desc = `${a.label}: group range (bar) and mean (dot) at ${tps.join(", ")}. Values are in the table below.`;
  return svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": desc, class: "i4-svg" }, svg("title", {}, desc), g);
}

function renderI4(doc) {
  const out = $("i4-out");
  out.replaceChildren();
  if (!doc || !Array.isArray(doc.analytes)) {
    out.append(h("p", { class: "hint" }, "Context data unavailable"));
    return;
  }
  for (const a of doc.analytes) {
    out.append(
      h("div", { class: "i4-card" },
        h("h3", {}, `${a.label} (${a.unit})`),
        i4Chart(a, doc.timepoints),
        h("details", {}, h("summary", {}, "Show the numbers"),
          h("div", { class: "i4-tablewrap" }, h("table", { class: "i4-table" },
            h("thead", {}, h("tr", {}, ["Timepoint", "n", "Min", "Max", "Mean"].map((c) => h("th", { scope: "col" }, c)))),
            h("tbody", {}, a.points.map((p) => h("tr", {}, h("th", { scope: "row" }, p.timepoint), h("td", {}, p.n), h("td", {}, fmtNum(p.min)), h("td", {}, fmtNum(p.max)), h("td", {}, fmtNum(p.mean)))))))),
        a.note ? h("p", { class: "hint" }, a.note) : null,
        h("p", { class: "hint" }, "Source: ", h("a", { href: a.study_url, target: "_blank", rel: "noopener" }, a.study), `, file ${a.source_file}.`)));
  }
  out.append(h("p", { class: "hint" }, doc.credit, ". Publications listed by OSDR for these studies: ",
    [...new Set(Object.values(doc.studies).flatMap((s) => s.dois))].map((d, i) => [i ? ", " : "", h("a", { href: `https://doi.org/${d}`, target: "_blank", rel: "noopener" }, d)]), "."));
}

async function loadI4() {
  try {
    const r = await fetch("i4_context.json");
    if (!r.ok) throw new Error(String(r.status));
    renderI4(await r.json());
  } catch (e) {
    renderI4(null); // the rest of the app does not depend on this panel
  }
}

async function init() {
  loadI4();
  const params = new URLSearchParams(location.search);
  const m = params.get("mission");
  setMission(Object.hasOwn(MISSIONS, m) ? m : DEFAULT_MISSION);

  $("sources").replaceChildren(...Object.entries(SOURCES).map(([id, s]) =>
    h("li", {}, h("a", { href: s.url, target: "_blank", rel: "noopener" }, `${id}: ${s.title}`), h("div", { class: "hint" }, `Used for: ${s.used_for}`))));

  try {
    const r = await fetch("cases.json");
    if (!r.ok) throw new Error(String(r.status));
    for (const c of (await r.json()).cases) state.stock[c.id] = c;
  } catch (e) {
    state.stock = {};
  }
  try {
    const r = await fetch("v3_extras.json");
    if (!r.ok) throw new Error(String(r.status));
    state.extras = await r.json();
  } catch (e) {
    state.extras = {}; // the engine still runs; scenario extras (SEC grades, medication, plan) are just absent
  }

  $("sym-checks").replaceChildren(...SYMPTOMS.map((x) => h("label", {}, h("input", { type: "checkbox", name: "sym", value: x.id }), ` ${x.label}`)));
  const pick = $("case-pick");
  for (const ec of state.extras.extra_cases || []) if (!Object.hasOwn(state.stock, ec.id)) state.stock[ec.id] = ec;
  const ids = Object.keys(state.stock);
  if (ids.length) {
    pick.replaceChildren(...ids.map((id) => h("option", { value: id }, `${id}: ${state.stock[id].label}`)));
    const wanted = params.get("case");
    selectCase(ids.includes(wanted) ? wanted : ids.includes(DEFAULT_CASE) ? DEFAULT_CASE : ids[0]);
  } else {
    pick.replaceChildren(h("option", { value: "" }, "Stock cases unavailable (cases.json not loaded)"));
    pick.disabled = true;
    $("case-note").textContent = "Enter values by hand below.";
    fillForm({ preflight: { age: 35, family_history: "none", thrombophilia: [], abo_non_o: false, hormone: "none" }, mission_days: 180, inflight: { mission_day: 30 }, scans: DEFAULT_SCANS, symptoms: emptyReport() });
  }

  pick.addEventListener("change", () => { state.signoff = null; selectCase(pick.value); render(); });
  $("form").addEventListener("input", onEdit);
  $("sym-form").addEventListener("input", onEdit);
  $("sym-clear").addEventListener("click", () => { fillSymptoms(emptyReport()); onEdit(); });
  $("form").addEventListener("change", () => { syncIjvDisabled(); onEdit(); });
  document.querySelectorAll('input[name="mission"]').forEach((r) => r.addEventListener("change", () => { state.signoff = null; setMission(r.value); render(); }));
  render();
}

init();
