// AI-assisted: written with Claude Code (Anthropic) for the NASA Space Apps 2026 entry. Synthetic data only.
// Flight Surgeon Console: a read-only review screen over the same engine as the main app (v3/pipeline.js runCase and
// score.js). It adds no clinical logic: it runs every synthetic crew case, sorts them by the agent's state and shows
// the evidence for one. All text goes in as text nodes.
import { runCase } from "./v3/pipeline.js";
import { score, MISSIONS, SOURCES, STASIS_CM_S } from "./score.js";
import { classify, latestInFlight, FORWARD, LOW, RETRO, NOT_MEASURED } from "./trend.js";

const PRIORITY = { RED_FLAG_OVERRIDE: 0, DETERIORATING: 1, DATA_INSUFFICIENT: 2, WATCH: 3, STABLE: 4 };
const STATE_LABEL = {
  RED_FLAG_OVERRIDE: "Emergency symptom",
  DETERIORATING: "Worsening trend",
  DATA_INSUFFICIENT: "Data needed",
  WATCH: "Watch",
  STABLE: "No pattern flagged",
};
const SIDE_SHORT = { [FORWARD]: "forward flow", [LOW]: "below 10 cm/s", [RETRO]: "retrograde", [NOT_MEASURED]: "not measured" };
const SVGNS = "http://www.w3.org/2000/svg";
const $ = (id) => document.getElementById(id);

function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v !== null && v !== undefined && v !== false) e.setAttribute(k, String(v));
  for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
}
function s(tag, attrs, ...kids) {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, String(v));
  for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
}

const state = { cases: [], extras: {}, mission: "mars", selected: null, rows: [] };
const crewName = (id) => `Crew ${id.replace(/^C/, "")}`;
const badge = (st) => h("span", { class: `badge b-${st}` }, STATE_LABEL[st] || st);
const short = (t, n = 96) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);

function extrasFor(id) {
  const x = Object.hasOwn(state.extras.cases || {}, id) ? { ...state.extras.cases[id] } : {};
  x.meds = { ...(x.meds || { regimen: "none" }), kit: state.extras.kit || [] };
  return x;
}

function runAll() {
  state.rows = state.cases.map((c) => {
    try {
      const r = runCase(c, extrasFor(c.id), { signoff: null, mission: state.mission });
      return { c, r, res: score(c), err: null };
    } catch (e) {
      return { c, r: null, res: null, err: e.message };
    }
  });
  state.rows.sort((a, b) => {
    const pa = a.r ? PRIORITY[a.r.packet.longitudinal_assessment.state] ?? 9 : 0.5; // engine error: right after emergencies
    const pb = b.r ? PRIORITY[b.r.packet.longitudinal_assessment.state] ?? 9 : 0.5;
    return pa - pb || (b.res?.total ?? 0) - (a.res?.total ?? 0) || a.c.id.localeCompare(b.c.id);
  });
}

function renderQueue() {
  const counts = {};
  for (const row of state.rows) if (row.r) { const st = row.r.packet.longitudinal_assessment.state; counts[st] = (counts[st] || 0) + 1; }
  $("counts").replaceChildren(...Object.keys(PRIORITY).filter((k) => counts[k]).map((k) => h("span", { class: `badge b-${k}` }, `${counts[k]} ${STATE_LABEL[k]}`)));
  $("queue").replaceChildren(...state.rows.map((row) => {
    const d = row.r?.packet.longitudinal_assessment;
    const btn = h("button", { type: "button", class: "q-btn", "data-id": row.c.id, "aria-current": String(row.c.id === state.selected) },
      h("span", { class: "q-crew" }, crewName(row.c.id), h("small", {}, `L+${row.c.inflight.mission_day ?? "?"}`)),
      h("span", { class: "q-pts" }, row.res ? `NASA ${row.res.total} pt${row.res.total === 1 ? "" : "s"}` : ""),
      h("span", {}, d ? badge(d.state) : h("span", { class: "badge b-RED_FLAG_OVERRIDE" }, "Engine stopped")),
      h("span", { class: "q-why" }, short(d ? (d.why?.[0] || d.action) : row.err)));
    btn.addEventListener("click", () => select(row.c.id, true));
    return h("li", { class: "q-item" }, btn);
  }));
}

function kpi(k, v, sub, cls = "") {
  return h("div", { class: `kpi ${cls}` }, h("div", { class: "k" }, k), h("div", { class: "v" }, v), sub ? h("div", { class: "s" }, sub) : null);
}

function sideKpi(c, side) {
  const latest = latestInFlight(c.scans);
  if (!latest) return kpi(`${side} IJV (duplex)`, "—", "No in-flight scan yet");
  const cl = classify(latest[side]);
  const v = latest[side]?.mean_peak_velocity_cm_s ?? null;
  return kpi(`${side} IJV (duplex)`, v !== null ? `${v} cm/s` : "—", `${SIDE_SHORT[cl]} · ${latest.label.split(" (")[0]}`, cl === LOW || cl === RETRO ? "flag" : "");
}

function ddimerKpi(c, res) {
  const b = c.inflight?.ddimer_baseline ?? null, n = c.inflight?.ddimer_now ?? null;
  if (b === null || n === null || !b) return kpi("D-dimer vs baseline", "—", "Not measured (NASA does not test it routinely in flight)");
  const pct = Math.round(((n - b) / b) * 1000) / 10;
  const scored = (res.items.find((i) => i.group === "D-dimer")?.points ?? 0) > 0; // the engine's own call, not a re-computed one
  return kpi("D-dimer vs baseline", `${pct > 0 ? "+" : ""}${pct}%`, `${b} → ${n} · NASA rule: more than +60%${scored ? " (met: +2)" : ""}`, scored ? "flag" : "");
}

// Both IJVs per recorded duplex exam; retrograde plotted below zero; NASA's 10 cm/s line (SP-20260005258 REV1 p.20).
function chart(c) {
  const series = ["left", "right"].map((side) => ({
    side,
    pts: c.scans.filter((sc) => sc.recorded && typeof sc[side]?.mean_peak_velocity_cm_s === "number").map((sc) => {
      const v = sc[side].mean_peak_velocity_cm_s, retro = sc[side].direction === "retrograde";
      return { day: sc.day, v, sv: retro ? -v : v, retro, label: sc.label.split(" (")[0] };
    }),
  }));
  const all = series.flatMap((x) => x.pts);
  if (new Set(all.map((p) => p.day)).size < 2) return h("p", { class: "cap" }, "The chart appears once two or more duplex exams are recorded.");
  const W = 640, H = 260, L = 46, R = 18, T = 16, B = 46;
  const rawHi = Math.max(40, Math.max(...all.map((p) => p.sv)) + 6); // headroom for the top label
  const rawLo = Math.min(0, Math.min(...all.map((p) => p.sv)));
  const step = rawHi - rawLo > 60 ? 20 : 10;
  const hi = Math.ceil(rawHi / step) * step, lo = Math.floor(rawLo / step) * step; // step-aligned, so 0 is always a tick
  const d0 = Math.min(...all.map((p) => p.day)), d1 = Math.max(...all.map((p) => p.day));
  const x = (d) => L + (W - L - R) * ((d - d0) / ((d1 - d0) || 1));
  const y = (v) => T + (H - T - B) * ((hi - v) / (hi - lo));
  const g = [];
  for (let t = lo; t <= hi; t += step) g.push(s("line", { x1: L, x2: W - R, y1: y(t), y2: y(t), stroke: "#e3e8ee" }), s("text", { x: L - 8, y: y(t) + 4, "text-anchor": "end", fill: "#5d6b79", "font-size": 11 }, String(t)));
  g.push(s("rect", { x: L, y: y(STASIS_CM_S), width: W - L - R, height: y(lo) - y(STASIS_CM_S), fill: "#fff6e6" }),
    s("line", { x1: L, x2: W - R, y1: y(STASIS_CM_S), y2: y(STASIS_CM_S), stroke: "#b54708", "stroke-width": 2, "stroke-dasharray": "6 4" }),
    s("text", { x: L + 6, y: y(STASIS_CM_S) - 6, fill: "#a14b00", "font-size": 11.5, "font-weight": 700 }, "10 cm/s: NASA duplex criterion"),
    s("text", { x: 2, y: 11, fill: "#5d6b79", "font-size": 11 }, "cm/s"));
  const days = [...new Map(all.map((p) => [p.day, p.label])).entries()];
  for (const [d, label] of days) g.push(s("text", { x: x(d), y: H - 22, "text-anchor": x(d) < L + 30 ? "start" : x(d) > W - R - 30 ? "end" : "middle", fill: "#5d6b79", "font-size": 11 }, label));
  for (const ser of series) {
    if (!ser.pts.length) continue;
    const left = ser.side === "left";
    g.push(s("polyline", { points: ser.pts.map((p) => `${x(p.day)},${y(p.sv)}`).join(" "), fill: "none", stroke: left ? "#1d4ed8" : "#6b7a8a", "stroke-width": left ? 3 : 2, "stroke-dasharray": left ? "" : "5 4" }));
    for (const p of ser.pts) {
      const flag = p.v < STASIS_CM_S || p.retro;
      g.push(s("circle", { cx: x(p.day), cy: y(p.sv), r: left ? 5.5 : 4, fill: flag ? "#f79009" : "#fff", stroke: left ? "#1d4ed8" : "#6b7a8a", "stroke-width": 2 }));
      if (left) g.push(s("text", { x: x(p.day), y: y(p.sv) - 10, "text-anchor": x(p.day) < L + 30 ? "start" : x(p.day) > W - R - 30 ? "end" : "middle", fill: "#0f1720", "font-size": 12, "font-weight": 700 }, `${p.v.toFixed(1)}${p.retro ? " retro" : ""}`));
    }
  }
  const nLeft = new Set(series[0].pts.map((p) => p.day)).size;
  const desc = `Synthetic IJV mean peak velocity per duplex exam. Left: ${series[0].pts.map((p) => `${p.label} ${p.sv} cm/s`).join(", ") || "none"}. Right: ${series[1].pts.map((p) => `${p.label} ${p.sv} cm/s`).join(", ") || "none"}. Dashed line: NASA's 10 cm/s duplex criterion; negative values are retrograde flow.`;
  return h("div", { class: "chart" },
    s("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": desc }, s("title", {}, desc), g),
    h("div", { class: "legend" }, h("span", {}, h("i", {}), "Left IJV"), h("span", {}, h("i", { class: "r" }), "Right IJV"), h("span", {}, h("i", { class: "n" }), "NASA 10 cm/s criterion")),
    h("p", { class: "cap" }, `Synthetic left IJV velocity observations from ${nLeft === 3 ? "three" : nLeft} examinations. The 10 cm/s reference is the NASA duplex criterion (NASA/SP-20260005258 REV1, p.20). Retrograde flow is plotted below zero. A review cue, not a diagnosis.`));
}

function timeline(c, p) {
  const items = [];
  const today = c.inflight?.mission_day ?? Infinity;
  for (const sc of c.scans) {
    const when = sc.in_flight ? sc.label.split(" (")[0] : "Pre-flight";
    if (!sc.recorded) { items.push([sc.day, when, h("span", { class: "t" }, sc.day > today ? "Scheduled duplex exam (upcoming)" : "Scheduled duplex exam: no result recorded")]); continue; }
    const parts = ["left", "right"].map((side) => {
      const cl = classify(sc[side]);
      const v = sc[side]?.mean_peak_velocity_cm_s;
      const txt = `${side} ${v ?? "—"}${v != null ? " cm/s" : ""} ${SIDE_SHORT[cl]}`;
      return cl === LOW || cl === RETRO ? h("span", { class: "warn" }, txt) : txt;
    });
    items.push([sc.day, when, h("span", {}, h("b", {}, "Duplex IJV: "), parts[0], " · ", parts[1])]);
  }
  const b = c.inflight?.ddimer_baseline ?? null, n = c.inflight?.ddimer_now ?? null;
  const md = c.inflight?.mission_day ?? 0;
  if (b !== null && n !== null) items.push([md, `L+${c.inflight.mission_day}`, h("span", {}, h("b", {}, "D-dimer: "), `${n} (baseline ${b})`)]);
  const sym = p.symptom_report;
  items.push([md, `L+${c.inflight.mission_day ?? "?"}`, sym.ticked.length ? h("span", { class: p.longitudinal_assessment.emergency ? "em" : "warn" }, `Symptoms: ${sym.ticked.join("; ")}`) : h("span", { class: "t" }, "Symptom checklist: none ticked")]);
  items.push([md + 0.5, `L+${c.inflight.mission_day ?? "?"}`, h("span", {}, h("b", {}, "Agent: "), STATE_LABEL[p.longitudinal_assessment.state], " → packet ", p.packet_status.replaceAll("_", " ").toLowerCase())]);
  items.sort((a, b2) => a[0] - b2[0]);
  return h("ol", { class: "tl" }, items.map(([, d, t]) => h("li", {}, h("span", { class: "d" }, d), t)));
}

function scoreTable(res) {
  const src = (id) => (Object.hasOwn(SOURCES, id) ? h("a", { href: SOURCES[id].url, target: "_blank", rel: "noopener" }, id) : id);
  return h("table", {},
    h("thead", {}, h("tr", {}, h("th", {}, "Factor"), h("th", {}, "NASA rule (word for word)"), h("th", {}, "Source"), h("th", { style: "text-align:right" }, "Pts"))),
    h("tbody", {}, res.items.map((i) => h("tr", {}, h("td", {}, i.group), h("td", {}, i.rule), h("td", {}, src(i.source)), h("td", { class: `pts${i.points ? "" : " zero"}` }, i.points ? `+${i.points}` : "0")))),
    h("tfoot", {}, h("tr", {}, h("td", { colspan: 3 }, `NASA band, for clinician review: ${res.nasa_reference_band}`), h("td", { class: "pts" }, String(res.total)))));
}

function renderDetail() {
  const out = $("detail");
  try { buildDetail(out); } catch (e) {
    out.replaceChildren(h("p", { class: "err" }, `Clinical engine stopped safely for this crew member: ${e.message}. Open the full record for details.`));
  }
}
function buildDetail(out) {
  const row = state.rows.find((x) => x.c.id === state.selected) || state.rows[0];
  if (!row) { out.replaceChildren(h("p", { class: "err" }, "No synthetic crew cases could be loaded.")); return; }
  const { c, r, res } = row;
  const head = h("div", { class: "card patient" },
    h("span", { class: "who" }, crewName(c.id)),
    h("span", { class: "meta" }, h("b", {}, "Synthetic case "), c.id, " · ", c.label),
    h("span", { class: "meta" }, h("b", {}, "Mission day "), `L+${c.inflight.mission_day ?? "?"} of ${c.mission_days}`, " · ", h("b", {}, "Age "), String(c.preflight.age), " · ", MISSIONS[state.mission].name));
  if (!r) { out.replaceChildren(head, h("p", { class: "err" }, `Clinical engine stopped safely: ${row.err}`)); return; }
  const p = r.packet, d = p.longitudinal_assessment;
  const blocking = p.missing_or_blocking || [];
  const status = h("div", { class: `card status s-${d.state}` },
    h("div", { class: "top" }, badge(d.state), h("span", { class: "state" }, d.state === "STABLE" ? "NO PATTERN FLAGGED" : d.state.replaceAll("_", " "))),
    h("p", d.emergency ? { class: "action", role: "alert" } : { class: "action" }, d.action),
    h("ul", {}, (d.why || []).map((w) => h("li", {}, w))),
    h("p", { class: "by" }, d.emergency ? "Follow the onboard emergency procedure now; the flight surgeon makes every later decision." : "Decided by the flight surgeon. The agent flags and prompts; it does not diagnose or prescribe."));
  const sym = p.symptom_report;
  const kpis = h("div", { class: "kpis" },
    kpi("NASA VTE score", `${res.total} pt${res.total === 1 ? "" : "s"}`, "Band shown for clinician review"),
    sideKpi(c, "left"), sideKpi(c, "right"), ddimerKpi(c, res),
    kpi("Symptoms today", sym.ticked.length ? `${sym.ticked.length} reported` : "None", sym.ticked.length ? sym.ticked.join("; ") : "Checklist: none ticked. Does not exclude thrombosis.", d.emergency ? "em" : sym.ticked.length ? "flag" : ""),
    kpi("Review packet", p.packet_status === "INCOMPLETE" ? "Incomplete" : p.packet_status === "PENDING_CLINICAL_REVIEW" ? "Pending review" : p.packet_status.replaceAll("_", " ").toLowerCase(), blocking.length ? short(blocking.join("; "), 80) : "No blocking data problems", blocking.length ? "flag" : ""));
  const two = h("div", { class: "two" },
    h("div", { class: "card" }, h("h2", {}, "IJV duplex trend"), chart(c)),
    h("div", { class: "card" }, h("h2", {}, "Evidence timeline"), timeline(c, p)));
  const table = h("div", { class: "card" }, h("h2", {}, "NASA VTE Risk Score: every point explained"), scoreTable(res),
    h("p", { class: "cap" }, "The score is not a diagnostic test. New symptoms need their own assessment whatever the score. ", h("a", { href: `./?case=${encodeURIComponent(c.id)}&mission=${state.mission}` }, "Open this crew member in the full record and flight-surgeon packet")));
  out.replaceChildren(head, status, kpis, two, table);
}

function select(id, push) {
  const hadFocus = document.activeElement?.classList?.contains("q-btn");
  state.selected = id;
  renderQueue();
  renderDetail();
  if (hadFocus) document.querySelector(`.q-btn[data-id="${CSS.escape(id)}"]`)?.focus(); // keep keyboard focus on the chosen row
  if (push) {
    const u = new URL(location.href);
    u.searchParams.set("crew", id);
    u.searchParams.set("mission", state.mission);
    history.replaceState(null, "", u);
  }
}

function renderMission() {
  const m = MISSIONS[state.mission];
  $("delay").textContent = `one-way delay ${m.simulated_one_way_delay_s >= 60 ? `${Math.round(m.simulated_one_way_delay_s / 60)} min` : `${m.simulated_one_way_delay_s} s`} (simulated)`;
}

async function init() {
  const params = new URLSearchParams(location.search);
  const m = params.get("mission");
  state.mission = Object.hasOwn(MISSIONS, m) ? m : "mars";
  const sel = $("mission");
  sel.replaceChildren(...Object.entries(MISSIONS).map(([id, x]) => h("option", { value: id, selected: id === state.mission }, x.name)));
  sel.addEventListener("change", () => { state.mission = sel.value; renderMission(); runAll(); select(state.selected, true); });
  renderMission();
  try {
    const [cr, er] = await Promise.all([fetch("cases.json"), fetch("v3_extras.json")]);
    if (!cr.ok) throw new Error(`cases.json ${cr.status}`);
    const cases = (await cr.json()).cases;
    state.extras = er.ok ? await er.json() : {};
    const ids = new Set(cases.map((c) => c.id));
    state.cases = [...cases, ...(state.extras.extra_cases || []).filter((c) => !ids.has(c.id))];
  } catch (e) {
    $("detail").replaceChildren(h("p", { class: "err" }, "Could not load the synthetic crew cases. Reload the page."));
    return;
  }
  runAll();
  const wanted = params.get("crew");
  select(state.rows.some((x) => x.c.id === wanted) ? wanted : state.rows[0]?.c.id, false);
}
init();
