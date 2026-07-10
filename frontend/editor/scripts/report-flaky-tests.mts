// Reads a Playwright JSON report and surfaces "flaky" tests (tests that
// failed at least once, then passed on retry) in GitHub Actions WITHOUT
// failing the job:
//   - emits one ::warning:: workflow command per flaky test, so the run and
//     PR show a yellow warning triangle + count, and the annotation links to
//     the test's source line
//   - appends a summary table to the job summary ($GITHUB_STEP_SUMMARY)
//
// A green-but-flaky job is otherwise invisible (Playwright exits 0 once a
// retry passes), which lets flakes accrete unnoticed. This makes them visible
// without turning them into hard failures.
//
// Run: `npx tsx editor/scripts/report-flaky-tests.mts <results.json> [more.json...]`
//      (a single path is also read from PLAYWRIGHT_JSON_OUTPUT_FILE). Multiple
//      reports are merged + de-duplicated, so a job that runs Playwright in
//      several segments (e.g. the enterprise OAuth/SAML/license phases) can
//      pass one report per phase. A missing report or zero flaky tests is a
//      silent no-op, so it is safe to run with `if: always()` after any
//      Playwright step.

import { appendFileSync, existsSync, readFileSync } from "fs";
import { isAbsolute, join, relative } from "path";
import type { JSONReport, JSONReportSuite } from "@playwright/test/reporter";

interface FlakyTest {
  file: string;
  line: number;
  title: string;
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

// Deliberately no process.exit() calls: every path falls through to a natural
// exit(0). This step must never fail the job, and it keeps CI green even when
// the report is missing or clean.
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

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    const plural = flaky.length === 1 ? "" : "s";
    const lines = [
      `### :warning: ${flaky.length} flaky test${plural} (passed on retry)`,
      "",
      "These passed, but not on the first attempt. Worth fixing before they turn into hard failures.",
      "",
      "| Test | Location |",
      "| --- | --- |",
      ...flaky.map((f) => `| ${f.title} | \`${f.file || "?"}:${f.line}\` |`),
      "",
    ];
    appendFileSync(summaryPath, lines.join("\n") + "\n");
  }
}

main();
