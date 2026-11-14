// AI-assisted: written with Claude Code (Anthropic). Prints the JS port's results as JSON so tests/test_parity.py can compare them with Python.
// Usage: node scripts/parity.mjs <cases.json>   (file is an array of cases, or an object with a "cases" array)
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const lib = await import(pathToFileURL(join(here, "..", "site", "score.js")).href);

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/parity.mjs <cases.json>");
  process.exit(2);
}
const data = JSON.parse(readFileSync(file, "utf8"));
const cases = Array.isArray(data) ? data : data.cases;

const results = cases.map((c) => {
  try {
    const out = { id: c.id ?? null, result: lib.score(c) };
    if (Number.isInteger(c.mission_days)) {
      out.schedule = lib.scanSchedule(c.mission_days);
      out.next_scan = lib.nextScan(c.mission_days, c.inflight?.mission_day ?? 0);
    }
    return out;
  } catch (e) {
    return { id: c.id ?? null, error: String(e.message) };
  }
});
const contexts = Object.fromEntries(Object.keys(lib.MISSIONS).map((m) => [m, lib.reviewContext(m)]));
console.log(JSON.stringify({ results, sources: lib.SOURCES, contexts }));
