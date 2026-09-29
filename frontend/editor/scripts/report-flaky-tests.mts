// Reads a Playwright JSON report and surfaces "flaky" tests (tests that
// failed at least once, then passed on retry) in GitHub Actions:
//   - emits one ::warning:: workflow command per flaky test, so the run and
//     PR show a yellow warning triangle + count, and the annotation links to
//     the test's source line
//   - appends a summary table to the job summary ($GITHUB_STEP_SUMMARY)

import { execFileSync } from "child_process";
import { appendFileSync, existsSync, readFileSync } from "fs";
import { isAbsolute, join, relative } from "path";
import type { JSONReport, JSONReportSuite } from "@playwright/test/reporter";

interface FlakyTest {
  file: string;
  line: number;
  title: string;
}

// Added/changed line ranges on the new side of `base...HEAD`, per repo-relative
// path, so a flaky test's declaration line can be tested for "this PR wrote it".
type ChangedLines = Map<string, Array<[number, number]>>;

// Parses `git diff --unified=0` hunk headers (`@@ -a,b +c,d @@`) for the given
// files into new-side line ranges. Whitespace-only churn is ignored so a
// reindent alone does not brand every test in the file as new. Fails open: a
// git error yields no ranges, so a broken diff warns rather than blocks.
function computeChangedLines(
  baseSha: string,
  workspace: string,
  files: string[],
): ChangedLines {
  const ranges: ChangedLines = new Map();
  if (files.length === 0) return ranges;
  let diff: string;
  try {
    diff = execFileSync(
      "git",
      [
        // A container checkout is often owned by a different uid than the
        // process, which otherwise trips git's dubious-ownership guard.
        "-c",
        `safe.directory=${workspace}`,
        "diff",
        "-w",
        "--unified=0",
        "--diff-filter=AMR",
        `${baseSha}...HEAD`,
        "--",
        ...files,
      ],
      { cwd: workspace, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
  } catch (error) {
    process.stdout.write(
      `::warning title=Flaky gate::could not diff against ${baseSha}; new-flake gate skipped (${error instanceof Error ? error.message : String(error)})\n`,
    );
    return ranges;
  }
  let current: string | null = null;
  for (const rawLine of diff.split("\n")) {
    if (rawLine.startsWith("+++ ")) {
      // "+++ b/path", or "+++ /dev/null" for a deletion (no new side).
      const path = rawLine.slice(4).replace(/^b\//, "");
      current = path === "/dev/null" ? null : path;
      if (current && !ranges.has(current)) ranges.set(current, []);
      continue;
    }
    if (!current || !rawLine.startsWith("@@")) continue;
    const match = /\+(\d+)(?:,(\d+))?/.exec(rawLine);
    if (!match) continue;
    const start = Number(match[1]);
    const count = match[2] === undefined ? 1 : Number(match[2]);
    // count 0 is a pure deletion: nothing added on the new side.
    if (count > 0) ranges.get(current)?.push([start, start + count - 1]);
  }
  return ranges;
}

function isNewlyIntroduced(test: FlakyTest, changed: ChangedLines): boolean {
  return (changed.get(test.file) ?? []).some(
    ([start, end]) => test.line >= start && test.line <= end,
  );
}

// Playwright records each test's outcome as expected|unexpected|flaky|skipped.
// "flaky" means it needed a retry to pass, which is exactly what we surface.
function collectFlaky(
  report: JSONReport,
  workspace: string,
  rootDir: string,
): FlakyTest[] {
  const flaky: FlakyTest[] = [];
  const walk = (suite: JSONReportSuite, trail: string[], depth: number) => {
    // The outermost suite per file has title === the file path; skip it so the
    // human-readable title is just "describe > test" (the path is shown
    // separately as the location). Nested suites are the describe() blocks.
    const titles = depth > 0 && suite.title ? [...trail, suite.title] : trail;
    for (const spec of suite.specs ?? []) {
      if ((spec.tests ?? []).some((t) => t.status === "flaky")) {
        const abs = spec.file
          ? isAbsolute(spec.file)
            ? spec.file
            : join(rootDir, spec.file)
          : "";
        const rel = abs ? relative(workspace, abs) : "";
        flaky.push({
          // Drop the path from the annotation if it escapes the workspace, so
          // we never emit a broken file= link (the warning still shows).
          file: rel && !rel.startsWith("..") ? rel : "",
          line: spec.line || 0,
          title: [...titles, spec.title].filter(Boolean).join(" > "),
        });
      }
    }
    for (const child of suite.suites ?? []) walk(child, titles, depth + 1);
  };
  for (const suite of report.suites ?? []) walk(suite, [], 0);
  return flaky;
}

// Exits non-zero only for a flake this PR introduced (strict mode below);
// every other path falls through to exit(0), so a missing or clean report, or
// a run with no base to diff against, keeps CI green.
function main(): void {
  // Accept one or more report paths: a job may run Playwright in several
  // segments, each writing its own report (the enterprise job does this for
  // OAuth / SAML / license phases). Fall back to the env var when no paths are
  // passed. Missing files are skipped, not fatal.
  const reportPaths = process.argv.slice(2);
  const envPath = process.env.PLAYWRIGHT_JSON_OUTPUT_FILE;
  if (reportPaths.length === 0 && envPath) {
    reportPaths.push(envPath);
  }

  const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
  const seen = new Set<string>();
  const flaky: FlakyTest[] = [];
  for (const reportPath of reportPaths) {
    if (!reportPath || !existsSync(reportPath)) {
      // No report (e.g. the build failed before this segment ran).
      continue;
    }
    const report = JSON.parse(readFileSync(reportPath, "utf8")) as JSONReport;
    const rootDir = report.config?.rootDir || process.cwd();
    for (const test of collectFlaky(report, workspace, rootDir)) {
      const key = `${test.file}:${test.line}:${test.title}`;
      if (!seen.has(key)) {
        seen.add(key);
        flaky.push(test);
      }
    }
  }
  if (flaky.length === 0) {
    return;
  }

  for (const f of flaky) {
    const loc = f.file ? `file=${f.file},line=${f.line},` : "";
    process.stdout.write(
      `::warning ${loc}title=Flaky test::${f.title} passed only on retry\n`,
    );
  }

  // Strict gate: on a PR (FLAKY_STRICT_BASE_SHA = the base commit), a flake the
  // PR itself introduced becomes an ::error:: and fails the job. Without a base
  // to diff against nothing is newly introduced, so the gate is inert.
  const baseSha = process.env.FLAKY_STRICT_BASE_SHA;
  const changed = baseSha
    ? computeChangedLines(baseSha, workspace, [
        ...new Set(flaky.map((f) => f.file).filter(Boolean)),
      ])
    : (new Map() as ChangedLines);
  const introduced = flaky.filter((f) => isNewlyIntroduced(f, changed));

  for (const f of introduced) {
    const loc = f.file ? `file=${f.file},line=${f.line},` : "";
    process.stdout.write(
      `::error ${loc}title=New flaky test::${f.title} was introduced by this change and passed only on retry; make it deterministic before merging\n`,
    );
  }

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    const plural = flaky.length === 1 ? "" : "s";
    const lines = [
      `### :warning: ${flaky.length} flaky test${plural} (passed on retry)`,
      "",
      "These passed, but not on the first attempt. Worth fixing before they turn into hard failures.",
      "",
      "| Test | Location | Introduced here |",
      "| --- | --- | --- |",
      ...flaky.map(
        (f) =>
          `| ${f.title} | \`${f.file || "?"}:${f.line}\` | ${introduced.includes(f) ? ":x: yes" : "no"} |`,
      ),
      "",
    ];
    if (introduced.length > 0) {
      lines.push(
        `**${introduced.length} of these ${introduced.length === 1 ? "was" : "were"} introduced by this change and fail the check.** A test must pass on the first attempt.`,
        "",
      );
    }
    appendFileSync(summaryPath, lines.join("\n") + "\n");
  }

  if (introduced.length > 0) {
    process.exitCode = 1;
  }
}

main();
