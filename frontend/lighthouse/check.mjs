// Lighthouse regression gate - baseline diff.
//
// Consumes run.mjs's summary.json and compares each route against
// lighthouse/baseline.json.
//
//   node lighthouse/check.mjs                 # diff (the gate)
//   node lighthouse/check.mjs --record        # (re)write the baseline
//
// Exit codes: 0 pass · 1 regression · 2 unusable run (missing/mismatched input).
//
// WHAT IS GATED, AND WHY ONLY THAT
//
// The absolute Lighthouse performance score of a wasm-backed PDF editor is
// never going to be pretty, and blocking merges on it would just teach everyone
// to ignore a permanently red check. So the score is not the gate.
//
// What is gated is transfer weight and request count per route, measured
// against a recorded baseline. Those are deterministic for a fixed build - the
// same dist served to the same Chrome transfers the same bytes every time - so
// a tolerance-bounded diff catches the regression that actually hurts (a heavy
// import landing in an eager chunk) without ever flaking.
//
// Everything else - the category scores and the lab timings - is reported next
// to its baseline delta and never fails the job. On a shared CI runner those
// numbers move several percent between identical commits; gating them would
// produce noise, not signal.

import {
  appendFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// oxlint-disable-next-line no-restricted-imports -- plain node script, run outside the bundler where @app/* does not resolve
import { ROUTES } from "./routes.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const frontendDir = resolve(here, "..");

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  const v = i >= 0 ? args[i + 1] : undefined;
  if (i >= 0 && (v === undefined || v.startsWith("--"))) {
    console.error(`lighthouse-check: ${name} requires a value`);
    process.exit(2);
  }
  return v ?? fallback;
};

const record = args.includes("--record");
const inDir = resolve(frontendDir, opt("--in", ".lighthouse-reports"));
const baselineFile = resolve(
  frontendDir,
  opt("--baseline", join("lighthouse", "baseline.json")),
);

// Byte counts are deterministic for a fixed build, so these exist to absorb
// chunk-hash churn and the odd request that reorders - not to grant headroom.
// The percentage catches a real new dependency on the big routes; the absolute
// floor stops a small route flapping over a few hundred bytes.
const BYTE_TOLERANCE_PCT = 0.02;
const BYTE_TOLERANCE_MIN = 10 * 1024;

// One extra request is a chunk split; three is a new feature phoning home.
const REQUEST_TOLERANCE = 2;

// Below this share of the baseline the page probably did not render. Treated as
// a failure rather than a win, because "bytes went down" is also what a blank
// error page looks like, and a silent pass here would bake the blank page into
// the next baseline.
const IMPLAUSIBLE_DROP = 0.5;

/** The budget metrics, in report order. `bytes` picks the tolerance rule. */
const BUDGETS = [
  { key: "totalBytes", label: "Transferred", bytes: true },
  { key: "scriptBytes", label: "JavaScript", bytes: true },
  { key: "requests", label: "Requests", bytes: false },
  { key: "scriptRequests", label: "JS requests", bytes: false },
];

const TIMINGS = [
  { key: "fcp", label: "FCP" },
  { key: "lcp", label: "LCP" },
  { key: "tbt", label: "TBT" },
  { key: "cls", label: "CLS" },
  { key: "speedIndex", label: "Speed Index" },
  { key: "bootupTime", label: "JS bootup" },
  { key: "domSize", label: "DOM nodes" },
];

/**
 * Category ids to report for one route, from the data rather than a fixed list,
 * so a category Lighthouse adds shows up and one it drops still prints its
 * baseline value instead of vanishing from the diff.
 */
const scoreKeys = (before, now) =>
  [
    ...new Set([...Object.keys(before ?? {}), ...Object.keys(now ?? {})]),
  ].sort();

const kib = (n) => `${(n / 1024).toFixed(1)} KiB`;
const fmt = (metric, v) =>
  v === null || v === undefined
    ? "-"
    : metric.bytes
      ? kib(v)
      : String(Math.round(v));

/** "+12.3 KiB (+4.1%)" - or "-" when there is nothing to compare against. */
function delta(now, before, bytes) {
  if (
    before === null ||
    before === undefined ||
    now === null ||
    now === undefined
  )
    return "-";
  const diff = now - before;
  if (diff === 0) return "=";
  const pct = before === 0 ? null : ((diff / before) * 100).toFixed(1);
  const sign = diff > 0 ? "+" : "-";
  const size = bytes ? kib(Math.abs(diff)) : String(Math.round(Math.abs(diff)));
  return pct === null
    ? `${sign}${size}`
    : `${sign}${size} (${diff > 0 ? "+" : ""}${pct}%)`;
}

/** The ceiling a metric may reach before it counts as a regression. */
function ceiling(metric, before) {
  return metric.bytes
    ? before + Math.max(before * BYTE_TOLERANCE_PCT, BYTE_TOLERANCE_MIN)
    : before + REQUEST_TOLERANCE;
}

function readJson(file, what) {
  if (!existsSync(file)) {
    console.error(`lighthouse-check: no ${what} at ${file}`);
    process.exit(2);
  }
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    console.error(
      `lighthouse-check: unreadable ${what} at ${file}: ${error.message}`,
    );
    process.exit(2);
  }
}

const summary = readJson(join(inDir, "summary.json"), "Lighthouse summary");

if (record) {
  const baseline = {
    recordedAt: summary.generatedAt,
    lighthouseVersion: summary.lighthouseVersion,
    chrome: summary.chrome,
    runs: summary.runs,
    routes: Object.fromEntries(
      Object.entries(summary.routes).map(([id, r]) => [
        id,
        {
          path: r.path,
          budget: r.budget,
          scores: r.scores,
          timings: r.timings,
        },
      ]),
    ),
  };
  writeFileSync(baselineFile, `${JSON.stringify(baseline, null, 2)}\n`);
  console.log(
    `lighthouse-check: recorded baseline for ${Object.keys(baseline.routes).length} route(s)`,
  );
  process.exit(0);
}

const baseline = readJson(baselineFile, "baseline");

// A route the run skipped, or one the baseline has never seen, means the diff
// below is not covering what it claims to. Either way the answer is the same:
// this run cannot be trusted, so say so rather than report a clean gate.
const expected = ROUTES.map((r) => r.id);
const scanned = Object.keys(summary.routes);
const missing = expected.filter((id) => !scanned.includes(id));
const unbaselined = scanned.filter((id) => !baseline.routes?.[id]);

if (missing.length) {
  console.error(
    `lighthouse-check: routes declared but not audited: ${missing.join(", ")}\n` +
      `  The run covered only part of routes.mjs - re-run without --only before gating.`,
  );
  process.exit(2);
}
if (unbaselined.length) {
  console.error(
    `lighthouse-check: no baseline for: ${unbaselined.join(", ")}\n` +
      `  A new or renamed route needs its baseline recorded in the same change:\n` +
      `    task frontend:lighthouse:record`,
  );
  process.exit(2);
}

const failures = [];
const lines = [];
const md = [];

if (
  baseline.lighthouseVersion &&
  baseline.lighthouseVersion !== summary.lighthouseVersion
) {
  // Not fatal: byte counts do not move with the Lighthouse version. Worth
  // saying out loud though, because the advisory timings below do.
  lines.push(
    `note: baseline recorded with Lighthouse ${baseline.lighthouseVersion}, this run used ${summary.lighthouseVersion}`,
    "",
  );
}

// The user-agent string carries the OS the baseline was recorded on. A build
// produced on one platform and audited on another should transfer the same
// bytes, but if it does not this is the line that explains an otherwise
// baffling first red run, so say it rather than leave someone guessing.
const platform = (ua) => /\(([^)]*)\)/.exec(ua ?? "")?.[1] ?? "unknown";
if (baseline.chrome && platform(baseline.chrome) !== platform(summary.chrome)) {
  lines.push(
    `note: baseline recorded on "${platform(baseline.chrome)}", this run is "${platform(summary.chrome)}"`,
    "",
  );
}

for (const route of ROUTES) {
  const now = summary.routes[route.id];
  const before = baseline.routes[route.id];

  lines.push(`${route.label}  (${route.path})`);
  md.push(
    `### ${route.label} \`${route.path}\``,
    "",
    "| Metric | Baseline | This run | Δ |",
    "| --- | ---: | ---: | ---: |",
  );

  for (const metric of BUDGETS) {
    const a = before.budget?.[metric.key] ?? null;
    const b = now.budget?.[metric.key] ?? null;
    const d = delta(b, a, metric.bytes);
    let mark = "  ";

    if (a !== null && b !== null) {
      if (b > ceiling(metric, a)) {
        mark = "✗ ";
        failures.push(
          `${route.label}: ${metric.label} ${fmt(metric, a)} → ${fmt(metric, b)}, ${d} - over the ${
            metric.bytes
              ? `${BYTE_TOLERANCE_PCT * 100}% / ${kib(BYTE_TOLERANCE_MIN)}`
              : `+${REQUEST_TOLERANCE}`
          } tolerance`,
        );
      } else if (a > 0 && b < a * IMPLAUSIBLE_DROP) {
        mark = "✗ ";
        failures.push(
          `${route.label}: ${metric.label} fell from ${fmt(metric, a)} to ${fmt(metric, b)} - ` +
            `too large a drop to assume it rendered. Check the report, then re-record if it is real.`,
        );
      } else if (b < a) {
        mark = "↓ ";
      }
    }

    lines.push(
      `  ${mark}${metric.label.padEnd(12)} ${fmt(metric, a).padStart(11)} → ${fmt(metric, b).padStart(11)}  ${d}`,
    );
    md.push(
      `| ${mark === "✗ " ? "**" : ""}${metric.label}${mark === "✗ " ? "**" : ""} | ${fmt(metric, a)} | ${fmt(metric, b)} | ${d} |`,
    );
  }

  // Advisory from here down - printed for the delta, never gated.
  const scoreCells = scoreKeys(before.scores, now.scores).map((key) => {
    const a = before.scores?.[key];
    const b = now.scores?.[key];
    const pct = (v) => (typeof v === "number" ? Math.round(v * 100) : "-");
    return `${key} ${pct(a)}→${pct(b)}`;
  });
  lines.push(`    scores (advisory): ${scoreCells.join("  ")}`);
  md.push("", `Scores (advisory): ${scoreCells.join(" · ")}`, "");

  const timingCells = TIMINGS.map((t) => {
    const a = before.timings?.[t.key];
    const b = now.timings?.[t.key];
    return `${t.label} ${delta(b, a, false)}`;
  });
  lines.push(`    timings (advisory): ${timingCells.join("  ")}`, "");
  md.push(`Timings (advisory): ${timingCells.join(" · ")}`, "");

  // Where the weight actually sits, heaviest first. Current run only, no
  // delta: Chrome moves a request between these buckets depending on how it
  // was fetched, so a baselined diff here would report churn as change. It
  // earns its place by answering "which kind of thing grew" before anyone
  // downloads the report.
  const weight = Object.entries(now.byType ?? {})
    .sort((a, b) => b[1].bytes - a[1].bytes)
    .slice(0, 4)
    .map(([type, v]) => `${type} ${kib(v.bytes)} in ${v.requests}`);
  if (weight.length) {
    lines.push(`    weight: ${weight.join("  ")}`, "");
    md.push(`Weight: ${weight.join(" · ")}`, "");
  }
}

console.log(lines.join("\n"));

if (process.env.GITHUB_STEP_SUMMARY) {
  const header = [
    "## Lighthouse",
    "",
    `Median of ${summary.runs} run(s), Lighthouse ${summary.lighthouseVersion}. ` +
      "Transfer weight and request counts are gated; scores and timings are reported only.",
    "",
  ];
  const footer = failures.length
    ? ["", "**Budget regressions**", "", ...failures.map((f) => `- ${f}`)]
    : ["", "No budget regressions."];
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    [...header, ...md, ...footer].join("\n") + "\n",
  );
}

if (failures.length) {
  console.error(
    `\nlighthouse-check: ${failures.length} budget regression(s):\n`,
  );
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error(
    `\nFull reports are in ${inDir} (uploaded as a CI artifact - open one at https://googlechrome.github.io/lighthouse/viewer/).`,
  );
  console.error(
    "If the increase is intended, re-record with: task frontend:lighthouse:record\n",
  );
  process.exit(1);
}

console.log("lighthouse-check: no budget regressions.");
