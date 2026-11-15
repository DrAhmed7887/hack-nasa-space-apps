// AI-assisted: written with Claude Code (Anthropic) for the NASA Space Apps 2026 entry. Synthetic data only.
// UI for the VTE score calculator, mission hand-off and A2A replay. The score comes from score.js (port of vte/score.py).
import { SYMPTOMS, assess, emptyReport } from "./symptoms.js";
import { classify, ijvFromScans, latestInFlight, scanState, trendRows, FORWARD, LOW, RETRO, NOT_MEASURED, TREND_NOTE } from "./trend.js";
import { score, scanSchedule, nextScan, reviewContext, fmtSeconds, MISSIONS, SOURCES, InputError } from "./score.js";

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

const state = { replay: null, stock: {}, caseId: null, stockSig: null, mission: DEFAULT_MISSION, scans: [], slot: 1 };

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
  renderReplay(c, res);
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
    h("p", { class: "hint" }, TREND_NOTE, " Colour is only a hint; the words carry the meaning."),
    h("p", { class: "hint" }, res ? `The score's IJV row (${res.items.find((i) => i.group === "IJV flow").points ? "+4" : "0"}) is read from the scan marked above: the same latest recorded in-flight scan.` : ""));
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

function currentRun(c) {
  if (!state.replay || !state.caseId || !c || sig(c) !== state.stockSig) return null;
  return state.replay.runs.find((r) => r.case_id === state.caseId && r.mission === state.mission) || null;
}

const run0 = (c) => currentRun(c);

function buildPacket(c, res) {
  const a = assess(c.symptoms);
  const ids = [...new Set(res.items.map((i) => i.source))];
  return { score: res, score_sources: ids.map((id) => ({ id, title: SOURCES[id].title, url: SOURCES[id].url })), scan_state: scanState(c.scans), symptom_report: a, message_shown: a.message };
}

function renderPacket(out, c, res, run) {
  if (!res || !c) return;
  const p = run ? run.packet : buildPacket(c, res);
  const st = p.scan_state;
  const sr = p.symptom_report;
  const item = (k, v) => h("li", {}, h("b", {}, k), v);
  out.append(
    h("h3", {}, "What the ground receives in the packet"),
    h("p", { class: "hint" }, run ? "From the recorded run." : "Built in the browser with the same fields (this case is not the stock recording)."),
    h("ul", { class: "pkt" },
      item("NASA score", `${p.score.total} point${p.score.total === 1 ? "" : "s"}: ${p.score.nasa_reference_band}`),
      item("Sources", p.score_sources.map((x) => x.id).join(", ")),
      item("Latest scan state", st.label ? `${st.label}: left ${st.left}; right ${st.right}. ${st.note}` : st.note),
      item("Symptom report", `${sr.ticked_labels.length ? sr.ticked_labels.join("; ") : "none ticked"}${sr.sudden_or_severe ? "; sudden or severe" : ""}${sr.checklist_done ? "; checklist done today" : "; checklist not marked done"}. Adds no points.`),
      item("Message shown to the crew", p.message_shown)),
    h("p", { class: "hint" }, "The crew sees that message at once, onboard. It never waits for the ground, and the ground agent makes no clinical decision."));
}

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
    h("p", { class: "hint" }, "Sources: ", ctx.sources.map((s, i) => [i ? ", " : "", sourceLink(s)]))
  );

  if (res) {
    out.append(h("p", {}, "The score does not change with distance. Only the review context does."));
    out.append(h("div", { class: "same", "aria-label": "Score by mission" },
      Object.keys(MISSIONS).map((m) => h("span", { class: m === state.mission ? "on" : "" }, `${MISSIONS[m].name}: ${res.total} points, ${res.nasa_reference_band.split(" = ")[1] || "no band"}`))));
  }

  renderPacket(out, c, res, run0(c, res));

  // timestamps: from the recording for stock cases, computed with the same rule otherwise
  const run = currentRun(c);
  let sent = null, recv = null, reply = null, from = "";
  if (run) {
    sent = run.packet.sent_at_mission_s; recv = run.ground_ack.received_at_mission_s; reply = run.ground_ack.reply_reaches_crew_at_mission_s;
    from = "From the recorded run.";
  } else if (c && Number.isInteger(c.inflight.mission_day)) {
    const d = ctx.simulated_one_way_delay_s;
    sent = c.inflight.mission_day * 86400; recv = sent + d; reply = sent + 2 * d;
    from = "Computed here with the same simulated delay (this case is not the stock recording).";
  }
  const flight = h("div", { class: "flight" },
    h("div", { class: "track", "aria-hidden": "true" },
      h("div", { class: "node a" }, "SC"), h("div", { class: "node b" }, "GND"),
      h("span", { class: "nl a" }, "Spacecraft"), h("span", { class: "nl b" }, "Ground"),
      h("div", { class: "packet go", id: "packet" })),
    h("div", { class: "flight-bar" },
      h("button", { type: "button", id: "replay-anim" }, "Replay animation"),
      h("span", { class: "hint" }, "The animation is short on purpose; the clock below shows the simulated delay.")));
  out.append(flight);
  if ($("fail-handoff").checked) {
    out.append(h("p", { class: "notice", role: "status" }, "Simulated failure: the ground was not reached, so nothing was delivered. The message shown to the crew above is unchanged; the packet would be re-sent when the link returns."));
  } else if (sent !== null) {
    out.append(
      h("dl", { class: "clock" },
        h("div", {}, h("dt", {}, "Packet sent from the spacecraft"), h("dd", {}, fmtClock(sent), ` (${fmtInt(sent)} s)`)),
        h("div", {}, h("dt", {}, "Received at the ground"), h("dd", {}, fmtClock(recv), ` (${fmtInt(recv)} s)`)),
        h("div", {}, h("dt", {}, "Ground reply reaches the crew"), h("dd", {}, fmtClock(reply), ` (${fmtInt(reply)} s)`))),
      h("p", { class: "hint" }, `Mission clock. ${from} The ground agent makes no clinical decision: a flight surgeon reviews the packet.`));
  } else {
    out.append(h("p", { class: "hint" }, "Set a valid mission day to see the mission-clock timestamps."));
  }
  $("replay-anim").addEventListener("click", () => {
    const p = $("packet");
    p.classList.remove("go");
    void p.offsetWidth;
    p.classList.add("go");
  });
}

function renderReplay(c, res) {
  const out = $("replay-out");
  out.replaceChildren();
  const st = $("replay-status");
  if (!state.replay) {
    st.textContent = "The recorded replay (replay.json) could not be loaded. The calculator above still works.";
    st.className = "error";
    return;
  }
  st.className = "hint";
  st.textContent = `Recorded ${state.replay.recorded_at_utc} UTC, ${state.replay.a2a_sdk}.`;
  const run = currentRun(c);
  if (!run) {
    out.append(h("p", { class: "notice" }, "You have edited this case, so the replay is hidden: it shows the stock cases only. Pick a case from the list above to see its recorded exchange."));
    return;
  }
  const xs = state.replay.exchanges.filter((e) => e.case_id === state.caseId && e.mission === state.mission);
  out.append(h("p", {}, `${state.caseId}, ${MISSIONS[state.mission].name}: ${xs.length} HTTP exchanges between the onboard agent and the ground agent.`));
  out.append(h("ol", { class: "ex" }, xs.map((e) => {
    const isReq = e.dir === "request";
    const what = e.path.includes("agent-card") ? "Agent card" : "SendMessage (message/send)";
    const who = e.port_role === "ground" ? "ground agent" : "onboard agent";
    let pretty = null;
    if (e.body) { try { pretty = JSON.stringify(JSON.parse(e.body), null, 2); } catch { pretty = String(e.body); } }
    return h("li", {},
      h("div", { class: "row" },
        h("span", { class: "badge" + (isReq ? " req" : "") }, isReq ? "request" : "response"),
        h("strong", {}, what), `${isReq ? "to" : "from"} ${who}`,
        h("code", {}, isReq ? `${e.method} ${e.path}` : `${e.status} ${e.path}`),
        h("span", { class: "hint" }, `${e.bytes} bytes`)),
      pretty ? h("details", {}, h("summary", {}, "Show raw JSON body"), h("pre", {}, pretty)) : null);
  })));
  if (state.caseId !== "C05") out.append(h("p", { class: "hint" }, "Raw bodies are kept for case C05 only; the other cases show the sequence and sizes."));
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
  if (state.caseId && !currentSigMatches()) {
    $("case-note").textContent = `Custom case (edited from ${state.caseId}). The replay shows stock cases only.`;
  } else if (state.caseId) {
    $("case-note").textContent = `Stock case ${state.caseId}. Editing any field makes it a custom case.`;
  }
  render();
}

async function init() {
  const params = new URLSearchParams(location.search);
  const m = params.get("mission");
  setMission(Object.hasOwn(MISSIONS, m) ? m : DEFAULT_MISSION);

  $("sources").replaceChildren(...Object.entries(SOURCES).map(([id, s]) =>
    h("li", {}, h("a", { href: s.url, target: "_blank", rel: "noopener" }, `${id}: ${s.title}`), h("div", { class: "hint" }, `Used for: ${s.used_for}`))));

  try {
    const r = await fetch("replay.json");
    if (!r.ok) throw new Error(String(r.status));
    state.replay = await r.json();
    for (const c of state.replay.cases) state.stock[c.id] = c;
  } catch (e) {
    state.replay = null;
  }

  $("sym-checks").replaceChildren(...SYMPTOMS.map((x) => h("label", {}, h("input", { type: "checkbox", name: "sym", value: x.id }), ` ${x.label}`)));
  const pick = $("case-pick");
  const ids = Object.keys(state.stock);
  if (ids.length) {
    pick.replaceChildren(...ids.map((id) => h("option", { value: id }, `${id}: ${state.stock[id].label}`)));
    const wanted = params.get("case");
    selectCase(ids.includes(wanted) ? wanted : ids.includes(DEFAULT_CASE) ? DEFAULT_CASE : ids[0]);
  } else {
    pick.replaceChildren(h("option", { value: "" }, "Stock cases unavailable (replay.json not loaded)"));
    pick.disabled = true;
    $("case-note").textContent = "Enter values by hand below.";
    fillForm({ preflight: { age: 35, family_history: "none", thrombophilia: [], abo_non_o: false, hormone: "none" }, mission_days: 180, inflight: { mission_day: 30 }, scans: DEFAULT_SCANS, symptoms: emptyReport() });
  }

  pick.addEventListener("change", () => { selectCase(pick.value); render(); });
  $("form").addEventListener("input", onEdit);
  $("sym-form").addEventListener("input", onEdit);
  $("sym-clear").addEventListener("click", () => { fillSymptoms(emptyReport()); onEdit(); });
  $("fail-handoff").addEventListener("change", render);
  $("form").addEventListener("change", () => { syncIjvDisabled(); onEdit(); });
  document.querySelectorAll('input[name="mission"]').forEach((r) => r.addEventListener("change", () => { setMission(r.value); render(); }));
  render();
}

init();
