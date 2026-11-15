// AI-assisted: written with Claude Code (Anthropic). Prints the JS symptom and trend results as JSON so tests can compare them with Python.
// Usage: node scripts/parity_v2.mjs <input.json>   input: {"reports": [...], "scan_sets": [...]}
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const site = (f) => import(pathToFileURL(join(here, "..", "site", f)).href);
const sym = await site("symptoms.js");
const trend = await site("trend.js");
const score = await site("score.js");

const input = JSON.parse(readFileSync(process.argv[2], "utf8"));
const attempt = (fn) => { try { return { ok: fn() }; } catch (e) { return { error: String(e.message) }; } };

console.log(JSON.stringify({
  symptoms: sym.SYMPTOMS,
  reports: input.reports.map((r) => attempt(() => sym.assess(r))),
  scan_sets: input.scan_sets.map((s) => attempt(() => ({
    rows: trend.trendRows(s), state: trend.scanState(s), ijv: trend.ijvFromScans(s),
    inflight_item: score.score({ preflight: { age: 30, family_history: "none", thrombophilia: [], abo_non_o: false, hormone: "none" }, scans: s })
      .items.find((i) => i.group === "IJV flow"),
  }))),
}));
