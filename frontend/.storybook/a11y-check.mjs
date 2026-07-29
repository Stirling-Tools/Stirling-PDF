// a11y regression gate — baseline diff.
//
// Consumes the Storybook Vitest scan's JSON reporter output (one or more files
// in --in) and compares each story's axe rule violations against
// .storybook/a11y-baseline.json. Existing violations are grandfathered; the gate
// fails when a story breaks a rule it wasn't already breaking, when a story
// crashes, or when the scan didn't cover everything it was supposed to.
//
//   node a11y-check.mjs --in <dir> --manifest <file>           # diff (the gate)
//   node a11y-check.mjs --in <dir> --manifest <file> --record   # (re)write baseline
//   node a11y-check.mjs --in <dir> --merge                     # union into baseline
//
// Exit codes: 0 pass · 1 regression · 2 unusable scan (incomplete/no input).
//
// The baseline records WHICH rules a story breaks, not how many nodes break
// them. Node counts drift between runs (stories fetch data asynchronously, so
// axe sometimes samples the DOM before late content lands), which made a
// count-based gate cry wolf on unrelated changes. Rule presence is stable, and
// "story now breaks a rule it didn't before" is the regression worth blocking.
//
// Run from frontend/. Baseline path defaults next to this script.

import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(n);
  const v = i >= 0 ? args[i + 1] : undefined;
  // A flag given without a value is a mistake, not a request for the default.
  if (i >= 0 && (v === undefined || v.startsWith("--"))) {
    console.error(`a11y-check: ${n} requires a value`);
    process.exit(2);
  }
  return v ?? d;
};
const record = args.includes("--record");
const merge = args.includes("--merge");
const inDir = opt("--in", ".a11y-scan");
const manifestFile = opt("--manifest", "");
const baselineFile = opt("--baseline", join(here, "a11y-baseline.json"));

// Every axe violation block in the matcher's message ends with a link to the
// rule's docs, e.g. .../rules/axe/4.11/color-contrast?application=axeAPI. That
// URL is the only machine-stable rule id in the message — the human-readable
// help text around it is free to change between addon and axe versions.
const RULE_URL = /dequeuniversity\.com\/rules\/axe\/[\d.]+\/([a-z0-9-]+)/g;

/** Reads every scan report in `dir`, keyed by "<storyFile> :: <storyName>". */
function collect(dir) {
  const rules = {}; // storyKey -> Set(ruleId)
  const crashed = []; // storyKey[] — failed for a non-a11y reason
  const seenFiles = new Set();
  let scanned = 0;

  for (const cf of readdirSync(dir).filter((f) => /\.json$/.test(f))) {
    let report;
    try {
      report = JSON.parse(readFileSync(join(dir, cf), "utf8"));
    } catch {
      console.error(`a11y-check: unreadable scan report: ${cf}`);
      process.exit(2);
    }
    for (const tf of report.testResults || []) {
      const norm = tf.name.replace(/\\/g, "/");
      const idx = norm.search(/editor\/src\//);
      const file = idx >= 0 ? norm.slice(idx) : norm;
      seenFiles.add(file);
      for (const a of tf.assertionResults || []) {
        scanned++;
        if (a.status === "passed") continue;
        const key = `${file} :: ${a.title || a.fullName || "?"}`;
        const found = new Set();
        for (const m of a.failureMessages || [])
          for (const hit of m.matchAll(RULE_URL)) found.add(hit[1]);
        if (found.size) {
          rules[key] = rules[key] || new Set();
          for (const id of found) rules[key].add(id);
        } else {
          // No rule link anywhere in the message: the story threw, timed out or
          // otherwise failed. Silently dropping these is how a broken scan can
          // look clean — and a crashed story reports no violations at all,
          // which would also mask any it really has.
          crashed.push(key);
        }
      }
    }
  }
  return { rules, crashed, seenFiles, scanned };
}

if (!existsSync(inDir)) {
  console.error(`a11y-check: scan dir not found: ${inDir}`);
  process.exit(2);
}
const { rules, crashed, seenFiles, scanned } = collect(inDir);
const observed = {};
for (const [k, set] of Object.entries(rules)) observed[k] = [...set].sort();

// Completeness: every story file the scan was asked to cover must appear in the
// reports. A dropped batch (killed process, empty report) would otherwise read
// as "those stories have no violations" and pass.
if (manifestFile) {
  if (!existsSync(manifestFile)) {
    console.error(`a11y-check: manifest not found: ${manifestFile}`);
    process.exit(2);
  }
  const expected = readFileSync(manifestFile, "utf8")
    .split("\n")
    .map((l) => l.trim().replace(/\\/g, "/"))
    .filter(Boolean);
  const missing = expected.filter((f) => !seenFiles.has(f));
  if (missing.length) {
    console.error(
      `a11y-check: scan is incomplete — ${missing.length} of ${expected.length} story files produced no results:`,
    );
    missing.slice(0, 20).forEach((f) => console.error(`  ${f}`));
    if (missing.length > 20)
      console.error(`  … and ${missing.length - 20} more`);
    console.error("Refusing to report on a partial scan.");
    process.exit(2);
  }
}

if (record || merge) {
  const base =
    merge && existsSync(baselineFile)
      ? JSON.parse(readFileSync(baselineFile, "utf8"))
      : {};
  if (crashed.length) {
    console.error(
      `a11y-check: refusing to record — ${crashed.length} story(ies) failed for a non-a11y reason:`,
    );
    crashed.slice(0, 20).forEach((k) => console.error(`  ${k}`));
    console.error("Fix those first; recording now would bake in blind spots.");
    process.exit(2);
  }
  // Union, so a re-record can only widen what's grandfathered — it never drops
  // a rule that a slower run happened to miss and then reports it as new.
  for (const [k, list] of Object.entries(observed))
    base[k] = [...new Set([...(base[k] || []), ...list])].sort();
  const sorted = {};
  for (const k of Object.keys(base).sort()) sorted[k] = base[k];
  writeFileSync(baselineFile, JSON.stringify(sorted, null, 2) + "\n");
  const pairs = Object.values(sorted).reduce((s, l) => s + l.length, 0);
  console.log(
    `baseline ${merge ? "merged" : "recorded"}: ${scanned} stories scanned, ` +
      `${Object.keys(sorted).length} with violations, ${pairs} story-rule pairs.`,
  );
  process.exit(0);
}

if (!existsSync(baselineFile)) {
  console.error("a11y-check: no baseline file:", baselineFile);
  process.exit(2);
}
const baseline = JSON.parse(readFileSync(baselineFile, "utf8"));

const regressions = [];
for (const [key, list] of Object.entries(observed)) {
  const base = baseline[key] || [];
  for (const id of list)
    if (!base.includes(id)) regressions.push(`NEW    ${key}  ${id}`);
}
// Stories that improved — reported so the baseline can be ratcheted down, never
// a failure.
const fixed = Object.keys(baseline).filter(
  (k) => seenFiles.has(k.split(" :: ")[0]) && !observed[k],
);

const pairs = Object.values(observed).reduce((s, l) => s + l.length, 0);
console.log(
  `a11y scan: ${scanned} stories, ${Object.keys(observed).length} with violations, ` +
    `${pairs} story-rule pairs (baselined).`,
);

if (crashed.length) {
  console.error(`\n✖ ${crashed.length} story(ies) failed to render:`);
  crashed.slice(0, 50).forEach((k) => console.error(`  ${k}`));
  if (crashed.length > 50) console.error(`  … and ${crashed.length - 50} more`);
}
if (regressions.length) {
  console.error(`\n✖ ${regressions.length} a11y regression(s) vs baseline:`);
  regressions.slice(0, 100).forEach((r) => console.error(`  ${r}`));
  if (regressions.length > 100)
    console.error(`  … and ${regressions.length - 100} more`);
  console.error(
    "\nFix the new violation(s). If a story was renamed or moved its old " +
      "baseline key no longer matches — re-record: task frontend:storybook:a11y:record",
  );
}
if (crashed.length || regressions.length) process.exit(1);

if (fixed.length)
  console.log(
    `✓ no a11y regressions. ${fixed.length} baselined story(ies) now clean — ` +
      `re-record to lock that in: task frontend:storybook:a11y:record`,
  );
else console.log("✓ no a11y regressions vs baseline.");
process.exit(0);
