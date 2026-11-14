// AI-assisted: written with Claude Code (Anthropic) for the NASA Space Apps 2026 entry.
// Faithful ES-module port of vte/score.py, vte/missions.py and vte/sources.py (the Python is the source of truth;
// scripts/parity.mjs + tests/test_parity.py check that both give identical results). Plain JS, no dependencies.

export const SRC = "VTE-2026";

export const RULE_AGE_40 = "Over 40 years of age: +1 point";
export const RULE_AGE_50 = "Over 50 years of age: +2 points";
export const RULE_FH_1 = "First-degree relative < 50 years of age with an unprovoked VTE: +1 points";
export const RULE_FH_2 = "Two+ first-degree relatives (at least one <50 years of age) with an unprovoked VTE: +2 points";
export const RULE_ABO = "Non-O allele of the ABO genotype: +1 point";
export const RULE_STASIS = "Stasis (less than 10 cm/s blood flow velocity) or retrograde flow: +4 points";
export const RULE_DDIMER = ">60% increase from established in-flight D-dimer baseline level: +2 points";
export const RULE_FVL_OTHER = "Factor V Leiden with other thrombophilia conditions: +10 points";

export const THROMBOPHILIA_POINTS = {
  fvl_het: [2, "Factor V Leiden heterozygous: +2 points"],
  fvl_hom: [8, "Factor V Leiden homozygous: +8 points"],
  protein_c: [3, "Protein C deficiency: +3 point"],
  protein_s: [3, "Protein S deficiency: +3 point"],
  at3: [10, "Antithrombin III deficiency: +10 points"],
  prothrombin_het: [2, "Prothrombin gene mutation, heterozygous: +2 point"],
};
const FVL = new Set(["fvl_het", "fvl_hom"]);

export const HORMONE_POINTS = {
  none: [0, "No hormone use: 0 points"],
  low: [0, "Use of 'low/no increased risk' hormone: 0 points"],
  some: [2, "Use of 'some increased risk' hormone: +2 points"],
  moderate: [2, "Use of 'moderate increased risk' hormone: +2 points"],
};
const FAMILY = ["none", "one_under_50", "two_plus"];

const STASIS_CM_S = 10.0;
const DDIMER_RISE = 0.60;

const BANDS = [
  [1, 1, "1 point = no additional action"],
  [2, 3, "2-3 points = increased monitoring"],
  [4, 6, "4-6 points = prophylactic apixaban"],
  [7, null, "> 6 points = need clinical assessment"],
];
export const NO_BAND_ZERO =
  "0 points: the report lists no band for 0; its lowest band is '1 point = no additional action'";

export class InputError extends Error {
  constructor(message) {
    super(message);
    this.name = "InputError";
  }
}

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const pyList = (a) => "[" + a.map((s) => `'${s}'`).join(", ") + "]"; // Python's repr of a sorted list of strings

// Python's format spec "g" (default precision 6) for the finite numbers this tool handles.
export function fmtG(x) {
  if (x === 0) return "0";
  const a = Math.abs(x);
  if (a < 1e-4 || a >= 1e6) {
    let [m, e] = x.toExponential(5).split("e");
    if (m.includes(".")) m = m.replace(/0+$/, "").replace(/\.$/, "");
    const sign = e[0] === "-" ? "-" : "+";
    let digits = e.replace(/^[+-]/, "");
    if (digits.length < 2) digits = "0" + digits;
    return `${m}e${sign}${digits}`;
  }
  return String(Number(x.toPrecision(6)));
}

// Python's format spec "+.1f".
function fmtSigned1(x) {
  const s = x.toFixed(1);
  return s.startsWith("-") ? s : "+" + s;
}

function item(group, rule, points, value) {
  return { group, rule, points, value, source: SRC };
}

function num(x, name, lo, hi) {
  if (typeof x !== "number" || Number.isNaN(x)) throw new InputError(`${name} must be a number`);
  if (!(lo <= x && x <= hi)) throw new InputError(`${name} must be between ${fmtLim(lo)} and ${fmtLim(hi)}`);
  return x;
}
// Python prints the limits with str(): ints as 18, floats as 1e-09 / 1000000.0 / 0.
function fmtLim(v) {
  if (v === 1e-9) return "1e-09";
  if (v === 1e6) return "1000000.0";
  return String(v);
}

export function bandFor(total) {
  if (total <= 0) return NO_BAND_ZERO;
  for (const [lo, hi, text] of BANDS) {
    if (total >= lo && (hi === null || total <= hi)) return text;
  }
  throw new Error("unreachable");
}

function scorePreflight(pre) {
  const items = [];
  const flags = [];
  const age = num(pre.age === undefined ? null : pre.age, "age", 18, 90);
  if (age > 50) items.push(item("Age", RULE_AGE_50, 2, age));
  else if (age > 40) items.push(item("Age", RULE_AGE_40, 1, age));
  else items.push(item("Age", "40 or under: no points listed", 0, age));

  const fh = has(pre, "family_history") ? pre.family_history : "none";
  if (!FAMILY.includes(fh)) throw new InputError(`family_history must be one of ${pyList([...FAMILY].sort())}`);
  if (fh === "one_under_50") items.push(item("Family history", RULE_FH_1, 1, fh));
  else if (fh === "two_plus") items.push(item("Family history", RULE_FH_2, 2, fh));
  else items.push(item("Family history", "None reported: no points listed", 0, fh));

  let codes = has(pre, "thrombophilia") ? pre.thrombophilia : [];
  if (!Array.isArray(codes) || codes.some((c) => !has(THROMBOPHILIA_POINTS, c))) {
    throw new InputError(`thrombophilia must be a list of ${pyList(Object.keys(THROMBOPHILIA_POINTS).sort())}`);
  }
  codes = [...new Set(codes)].sort();
  if (codes.includes("fvl_het") && codes.includes("fvl_hom")) {
    throw new InputError("Factor V Leiden cannot be both heterozygous and homozygous");
  }
  const fvl = codes.filter((c) => FVL.has(c));
  const other = codes.filter((c) => !FVL.has(c));
  if (fvl.length && other.length) {
    items.push(item("Thrombophilia", RULE_FVL_OTHER, 10, codes));
    flags.push("Factor V Leiden with another thrombophilia: the report's single +10 row is used, not a sum.");
  } else if (codes.length) {
    for (const c of codes) {
      const [pts, rule] = THROMBOPHILIA_POINTS[c];
      items.push(item("Thrombophilia", rule, pts, c));
    }
    if (other.length > 1) {
      flags.push(
        "Two or more non-Factor V Leiden thrombophilias: the report does not say how to combine them; points are summed here. Clinician review."
      );
    }
  } else {
    items.push(item("Thrombophilia", "None reported: no points listed", 0, []));
  }

  const abo = has(pre, "abo_non_o") ? pre.abo_non_o : false;
  if (typeof abo !== "boolean") throw new InputError("abo_non_o must be true or false");
  items.push(abo ? item("Blood type", RULE_ABO, 1, true) : item("Blood type", "O/O: no points listed", 0, false));

  const hormone = has(pre, "hormone") ? pre.hormone : "none";
  if (!has(HORMONE_POINTS, hormone)) {
    throw new InputError(`hormone must be one of ${pyList(Object.keys(HORMONE_POINTS).sort())}`);
  }
  const [pts, rule] = HORMONE_POINTS[hormone];
  items.push(item("Hormone use", rule, pts, hormone));
  return [items, flags];
}

function scoreInflight(inf) {
  const items = [];
  const flags = [];
  inf = inf || {};
  const ijv = inf.ijv === undefined ? null : inf.ijv;
  if (ijv === null) {
    items.push(item("IJV flow", "No in-flight ultrasound yet: not scored", 0, null));
    flags.push("In-flight IJV ultrasound not done yet: the total covers pre-flight factors only.");
  } else {
    const sides = isObj(ijv) ? Object.keys(ijv).sort() : [];
    if (!isObj(ijv) || !sides.length || sides.some((s) => s !== "left" && s !== "right")) {
      throw new InputError("ijv must map 'left' and/or 'right' to a scan result");
    }
    const hits = [];
    for (const side of sides) {
      const scan = ijv[side] || {};
      let v = scan.mean_peak_velocity_cm_s === undefined ? null : scan.mean_peak_velocity_cm_s;
      const retro = scan.retrograde === undefined ? false : scan.retrograde;
      if (typeof retro !== "boolean") throw new InputError(`${side} retrograde must be true or false`);
      if (v !== null) v = num(v, `${side} mean peak velocity`, 0, 200);
      if (retro) hits.push(`${side}: retrograde flow`);
      else if (v !== null && v < STASIS_CM_S) hits.push(`${side}: ${fmtG(v)} cm/s`);
      if (v === null && !retro) flags.push(`${side} IJV velocity not recorded.`);
    }
    if (hits.length) items.push(item("IJV flow", RULE_STASIS, 4, hits.join("; ")));
    else items.push(item("IJV flow", "No stasis (<10 cm/s) or retrograde flow found: 0 points", 0, "normal"));
  }

  let base = inf.ddimer_baseline === undefined ? null : inf.ddimer_baseline;
  let now = inf.ddimer_now === undefined ? null : inf.ddimer_now;
  if (base === null || now === null) {
    items.push(item("D-dimer", "Not measured: not scored", 0, null));
    flags.push(
      "D-dimer not measured. The report: 'NASA does not routinely test D-dimer levels in astronauts. There are no existing adequate in-flight testing methods'."
    );
  } else {
    base = num(base, "D-dimer baseline", 1e-9, 1e6);
    now = num(now, "D-dimer now", 0, 1e6);
    const rise = (now - base) / base;
    const pts = rise > DDIMER_RISE ? 2 : 0;
    const rule = pts ? RULE_DDIMER : "Rise of 60% or less from the in-flight baseline: 0 points";
    items.push(item("D-dimer", rule, pts, `${fmtSigned1(rise * 100)}% from baseline`));
  }
  return [items, flags];
}

const sum = (items) => items.reduce((t, i) => t + i.points, 0);

export function score(c) {
  if (!isObj(c) || !isObj(c.preflight)) throw new InputError("case must be an object with a 'preflight' object");
  const [preItems, preFlags] = scorePreflight(c.preflight);
  const [inItems, inFlags] = scoreInflight(c.inflight);
  const items = [...preItems, ...inItems];
  const total = sum(items);
  return {
    case_id: c.id === undefined ? null : c.id,
    items,
    preflight_points: sum(preItems),
    inflight_points: sum(inItems),
    total,
    nasa_reference_band: bandFor(total),
    flags: [...preFlags, ...inFlags],
    note: "Reference for clinician review, following NASA's published method. Not a diagnosis, prediction or prescription.",
    source: SRC,
  };
}

// IJV ultrasound schedule, OCHMO-MTB-007 (example for a 180-day ISS mission).
export function scanSchedule(missionDays) {
  if (!Number.isInteger(missionDays) || missionDays < 1 || missionDays > 1500) {
    throw new InputError("mission_days must be a whole number from 1 to 1500");
  }
  const rows = [30, 60].filter((d) => d < missionDays).map((d) => ({ day: d, label: `L+${d} days` }));
  const r42 = missionDays - 42;
  if (r42 > 0 && rows.every((r) => r.day !== r42)) rows.push({ day: r42, label: "R-42 days" });
  rows.sort((a, b) => a.day - b.day);
  for (const r of rows) r.source = "MTB-007";
  return rows;
}

export function nextScan(missionDays, today) {
  return scanSchedule(missionDays).find((r) => r.day >= today) || null;
}

// ---- sources.py ----
export const SOURCES = {
  "VTE-2026": {
    title: "NASA Risk of Venous Thromboembolism in Spaceflight. Outcomes of Working Group Meeting - April 2026 (NASA/SP-20260005258, REV1, 2 July 2026)",
    url: "https://www.nasa.gov/wp-content/uploads/2026/06/risk-venous-thromboembolism-assessment-sp20260005258.pdf",
    used_for: "VTE Risk Score for Astronauts: points per risk factor and the four action bands",
  },
  "MTB-007": {
    title: "NASA OCHMO Medical Technical Brief OCHMO-MTB-007, Venous Thrombosis in Spaceflight",
    url: "https://www.nasa.gov/wp-content/uploads/2026/01/ochmo-mtb-007-venous-thrombosis-in-spaceflight.pdf",
    used_for: "Internal jugular vein screening schedule (example for a 180-day ISS mission)",
  },
  "TB-007": {
    title: "NASA-STD-3001 Technical Brief OCHMO-TB-007, Mission Duration (Rev A, 12 Dec 2023)",
    url: "https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-007-mission-duration.pdf",
    used_for: "Mission context: communication latency and evacuation by destination",
  },
  "NTRS-20250002759": {
    title: "NASA, IMM vs IMPACT, Artemis II (AsMA 2025 slides, NTRS 20250002759)",
    url: "https://ntrs.nasa.gov/citations/20250002759",
    used_for: "Lunar communication latency figure (5-14 s), used only to set the simulated delay",
  },
};

// ---- missions.py (context only: never changes the score) ----
export const MISSIONS = {
  leo: {
    name: "Low Earth orbit",
    communication: "Near real-time communications (1-1.5 seconds)",
    evacuation: "Evacuation capabilities; Distance from Earth / Evacuation: 1 day or less",
    ground_support: "Reliance on Earth",
    simulated_one_way_delay_s: 1.5,
    delay_basis: "upper end of '1-1.5 seconds' (TB-007)",
    sources: ["TB-007"],
  },
  moon: {
    name: "Lunar mission",
    communication: "Minor communication latencies",
    evacuation: "Evacuation capabilities (3-11 days)",
    ground_support: "Restrictions in onboard medical capability",
    simulated_one_way_delay_s: 14.0,
    delay_basis: "upper end of 'Comm Latency 5-14 sec' (NTRS 20250002759)",
    sources: ["TB-007", "NTRS-20250002759"],
  },
  mars: {
    name: "Mars mission",
    communication: "Extended communication latencies (0-40 minutes)",
    evacuation: "No evacuation capability",
    ground_support: "Limited ground medical support/autonomous Medical Care",
    simulated_one_way_delay_s: 2400.0,
    delay_basis: "upper end of '0-40 minutes' (TB-007)",
    sources: ["TB-007"],
  },
};

export function fmtSeconds(s) {
  return s < 60 ? `${fmtG(s)} s` : `${fmtG(s / 60)} min`;
}

export function reviewContext(missionId) {
  if (!has(MISSIONS, missionId)) throw new Error(`mission must be one of ${pyList(Object.keys(MISSIONS).sort())}`);
  const m = MISSIONS[missionId];
  const one = m.simulated_one_way_delay_s;
  return {
    mission: missionId,
    name: m.name,
    communication: m.communication,
    evacuation: m.evacuation,
    ground_support: m.ground_support,
    simulated_one_way_delay_s: one,
    earliest_ground_reply_s: 2 * one,
    summary: `Simulated delay ${fmtSeconds(one)} each way: the earliest ground reply comes ${fmtSeconds(2 * one)} after sending.`,
    delay_basis: m.delay_basis,
    sources: m.sources,
  };
}
