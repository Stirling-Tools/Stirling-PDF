// Triage helper: turns the raw a11y scan reports into a per-story, per-rule
// table with the offending element/colour detail, so each failure can be
// attributed to either the Storybook harness or the component itself.
//
//   node a11y-triage.mjs [--in .a11y-scan] [--json out.json]
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : d;
};
const inDir = opt("--in", ".a11y-scan");
const jsonOut = opt("--json", "");

const RULE_URL = /dequeuniversity\.com\/rules\/axe\/[\d.]+\/([a-z0-9-]+)/g;
const CONTRAST =
  /contrast of ([\d.]+) \(foreground color: (#[0-9a-f]+), background color: (#[0-9a-f]+)/g;
const ELEMENT = /^\s*(<[^\n]{0,160})/gm;

const rows = [];

for (const f of readdirSync(inDir).filter((n) => n.endsWith(".json"))) {
  const data = JSON.parse(readFileSync(join(inDir, f), "utf8"));
  const visit = (node, name) => {
    if (Array.isArray(node)) return node.forEach((n) => visit(n, name));
    if (!node || typeof node !== "object") return;
    const self = node.fullName || node.title || name;
    if (Array.isArray(node.failureMessages) && node.failureMessages.length) {
      const text = node.failureMessages.join("\n");
      const rules = new Set([...text.matchAll(RULE_URL)].map((m) => m[1]));
      const colours = [...text.matchAll(CONTRAST)].map((m) => ({
        ratio: Number(m[1]),
        fg: m[2],
        bg: m[3],
      }));
      const elements = [...text.matchAll(ELEMENT)]
        .map((m) => m[1].trim())
        .filter((e) => e.startsWith("<"))
        .slice(0, 4);
      for (const rule of rules) {
        rows.push({
          story: self,
          rule,
          colours: rule === "color-contrast" ? colours : [],
          elements,
        });
      }
    }
    for (const [k, v] of Object.entries(node)) {
      if (k === "failureMessages") continue;
      visit(v, self);
    }
  };
  visit(data, undefined);
}

const byRule = {};
for (const r of rows) (byRule[r.rule] ??= []).push(r);

console.log(`stories with failures: ${new Set(rows.map((r) => r.story)).size}`);
console.log(`story-rule pairs:      ${rows.length}\n`);
for (const [rule, list] of Object.entries(byRule).sort(
  (a, b) => b[1].length - a[1].length,
)) {
  console.log(`${String(list.length).padStart(4)}  ${rule}`);
}

const pairs = {};
for (const r of rows)
  for (const c of r.colours) {
    const k = `${c.fg} on ${c.bg} (${c.ratio})`;
    pairs[k] = (pairs[k] ?? 0) + 1;
  }
if (Object.keys(pairs).length) {
  console.log("\ncontrast pairs:");
  for (const [k, n] of Object.entries(pairs).sort((a, b) => b[1] - a[1]))
    console.log(`${String(n).padStart(4)}  ${k}`);
}

if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify(rows, null, 2));
  console.log(`\nwrote ${jsonOut}`);
}
