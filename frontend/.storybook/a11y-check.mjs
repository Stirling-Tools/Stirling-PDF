// a11y regression gate — baseline diff.
//
// Consumes the Storybook Vitest scan's JSON reporter output (one or more files
// in --in) and compares axe violations against .storybook/a11y-baseline.json.
// The existing violations are grandfathered; the gate fails only when a story
// gains a rule it didn't have, gains MORE of one than the baseline, or a new
// story has any violation. Ratchet down by re-recording after fixes.
//
//   node a11y-check.mjs --record --in <dir>   # (re)write the baseline
//   node a11y-check.mjs          --in <dir>   # diff; exit 1 on regressions
//
// Run from frontend/. Baseline path defaults next to this script.

import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const record = args.includes("--record");
const inDir = opt("--in", ".a11y-scan");
const baselineFile = opt("--baseline", join(here, "a11y-baseline.json"));
// Guard against a broken/incomplete scan silently passing the gate: require at
// least this many story results to have run. Set from the known story count.
const minStories = Number(opt("--min-stories", "500"));

// axe rule ids we track (ignore incidental parenthesised tokens in messages)
const RULE =
  /contrast|aria-|label|button-name|link-name|image-alt|heading-order|^list$|listitem|region|nested-interactive|duplicate-id|svg-img-alt|document-title|html-|landmark|select-name|frame-title|scrollable-region-focusable|tabindex|autocomplete|valid-attr|command-name|required-children|required-attr|roles|dialog-name|progressbar-name|title-only|toggle-field-name|input-field-name|prohibited-attr|allowed-attr|hidden-focus|meta-viewport/;

function collect(dir) {
  const violations = {}; // storyKey -> { rule: count }
  let scanned = 0;
  const files = readdirSync(dir).filter((f) => /\.json$/.test(f));
  for (const cf of files) {
    let r;
    try {
      r = JSON.parse(readFileSync(join(dir, cf), "utf8"));
    } catch {
      continue;
    }
    for (const tf of r.testResults || []) {
      const norm = tf.name.replace(/\\/g, "/");
      const idx = norm.search(/editor\/src\//);
      const file = idx >= 0 ? norm.slice(idx) : norm;
      for (const a of tf.assertionResults || []) {
        scanned++;
        if (a.status === "passed") continue;
        const key = file + " :: " + (a.title || a.fullName || "?");
        const rules = {};
        for (const m of a.failureMessages || [])
          for (const raw of m.match(/\(([a-z][a-z0-9-]+)\)/g) || []) {
            const id = raw.slice(1, -1);
            if (RULE.test(id)) rules[id] = (rules[id] || 0) + 1;
          }
        if (Object.keys(rules).length) {
          violations[key] = violations[key] || {};
          for (const [id, n] of Object.entries(rules))
            violations[key][id] = Math.max(violations[key][id] || 0, n);
        }
      }
    }
  }
  return { violations, scanned };
}

if (!existsSync(inDir)) {
  console.error(`a11y-check: scan dir not found: ${inDir}`);
  process.exit(2);
}
const { violations, scanned } = collect(inDir);
const total = Object.values(violations).reduce(
  (s, r) => s + Object.values(r).reduce((a, b) => a + b, 0),
  0,
);

if (record) {
  writeFileSync(baselineFile, JSON.stringify(violations, null, 2) + "\n");
  console.log(
    `baseline recorded: ${scanned} stories scanned, ${Object.keys(violations).length} with violations, ${total} total.`,
  );
  process.exit(0);
}

if (scanned < minStories) {
  console.error(
    `a11y-check: only ${scanned} stories scanned (< ${minStories}) — scan looks incomplete; refusing to pass.`,
  );
  process.exit(2);
}
if (!existsSync(baselineFile)) {
  console.error("a11y-check: no baseline file:", baselineFile);
  process.exit(2);
}
const baseline = JSON.parse(readFileSync(baselineFile, "utf8"));

const regressions = [];
for (const [key, rules] of Object.entries(violations)) {
  const base = baseline[key] || {};
  for (const [id, n] of Object.entries(rules)) {
    if (!(id in base)) regressions.push(`NEW    ${key}  ${id} (x${n})`);
    else if (n > base[id])
      regressions.push(`WORSE  ${key}  ${id} (${base[id]} -> ${n})`);
  }
}

console.log(
  `a11y scan: ${scanned} stories, ${Object.keys(violations).length} with violations, ${total} total (baselined).`,
);
if (regressions.length) {
  console.error(`\n✖ ${regressions.length} a11y regression(s) vs baseline:`);
  regressions.slice(0, 100).forEach((r) => console.error("  " + r));
  console.error(
    "\nFix the new violation(s). If intentional, re-record: task frontend:storybook:a11y:record",
  );
  process.exit(1);
}
console.log("✓ no a11y regressions vs baseline.");
process.exit(0);
