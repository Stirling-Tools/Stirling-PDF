// Runs the Storybook Vitest scan in batches and emits one JSON report per batch
// into .a11y-scan/, plus a manifest of every story file the run was supposed to
// cover and a log of the raw output. Consumed by a11y-check.mjs, which fails if
// any manifest entry produced no results. Run from frontend/.
//
//   node a11y-scan.mjs                 scan every story
//   node a11y-scan.mjs <file> [file…]  scan only these story files
//
// Batching keeps each browser session small: a single run over the whole story
// set holds one Chromium context open for the entire scan, so one crash in it
// costs every story after that point.
//
// Node rather than shell so the task works no matter what invokes it — Task's
// embedded interpreter runs on Windows, but bash/sed/sort do not exist for
// developers calling tasks from PowerShell.
import { execFileSync, spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const OUT = ".a11y-scan";
const CHUNK = 20;
const BATCH_TIMEOUT_MS = 300_000;

const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8" })
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const manifestFile = join(OUT, "manifest.txt");
const logFile = join(OUT, "scan.log");

const args = process.argv.slice(2);
let files;
if (args.length > 0) {
  // Explicit list (the pull-request path passes just the stories a branch
  // affects). Anything that no longer exists is dropped, so a deleted story
  // doesn't fail the manifest check.
  files = [...new Set(args.filter((f) => existsSync(f)))].sort();
  if (files.length === 0) {
    console.log(
      "a11y-scan: no existing story files in the given list — nothing to scan",
    );
    writeFileSync(manifestFile, "");
    process.exit(0);
  }
} else {
  // Tracked story files plus any not yet committed, so a new story can be
  // checked before it is added to the index.
  files = [
    ...new Set([
      ...git(
        "ls-files",
        "--",
        "editor/src/**/*.stories.ts",
        "editor/src/**/*.stories.tsx",
      ),
      ...git(
        "ls-files",
        "--others",
        "--exclude-standard",
        "--",
        "editor/src/**/*.stories.ts",
        "editor/src/**/*.stories.tsx",
      ),
    ]),
  ].sort();
  if (files.length === 0) {
    console.error("a11y-scan: no story files found — check the glob");
    process.exit(2);
  }
}
writeFileSync(manifestFile, files.join("\n") + "\n");

/** Failures carrying no axe rule — a throw, a timeout, a dropped browser page. */
function crashCount(reportFile) {
  try {
    const report = JSON.parse(readFileSync(reportFile, "utf8"));
    let crashes = 0;
    for (const tf of report.testResults ?? [])
      for (const a of tf.assertionResults ?? []) {
        if (a.status === "passed") continue;
        const msg = (a.failureMessages ?? []).join("\n");
        if (!/dequeuniversity\.com\/rules\/axe\//.test(msg)) crashes++;
      }
    return crashes;
  } catch {
    return -1; // unreadable report counts as a failed attempt
  }
}

/** Runs one vitest batch, tee'd to the log, killed (whole tree) on timeout. */
function runBatch(filters, outputFile) {
  return new Promise((resolve) => {
    const cmd =
      `npx vitest run --config .storybook/vitest.config.ts ` +
      `--reporter=json --outputFile=${outputFile} ` +
      filters.map((f) => `"${f}"`).join(" ");
    const log = openSync(logFile, "a");
    const child = spawn(cmd, {
      shell: true,
      detached: process.platform !== "win32",
      stdio: ["ignore", log, log],
    });
    const timer = setTimeout(() => {
      if (process.platform === "win32") {
        try {
          execFileSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
            stdio: "ignore",
          });
        } catch {
          /* already gone */
        }
      } else {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          /* already gone */
        }
      }
    }, BATCH_TIMEOUT_MS);
    child.on("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

const hasReport = (f) => existsSync(f) && statSync(f).size > 0;

const batches = [];
for (let i = 0; i < files.length; i += CHUNK)
  batches.push(files.slice(i, i + CHUNK));
console.log(
  `a11y-scan: ${files.length} story files, ${batches.length} batches of ${CHUNK}`,
);

const failed = [];
for (let bi = 0; bi < batches.length; bi++) {
  const n = bi + 1;
  const out = join(OUT, `chunk-${n}.json`);
  // The scan exits non-zero whenever a story has a violation — expected here,
  // so the report is what matters, not the status.
  //
  // A batch is retried once when it produced no report, or when its report
  // contains crash-class failures. A one-off infrastructure death — the
  // browser page dropping, a Vite dep re-optimize reloading mid-run — passes
  // on the retry; a story that genuinely cannot render fails both attempts.
  const filters = batches[bi].map((f) => f.replace(/\.tsx$/, ""));
  for (let attempt = 1; attempt <= 2; attempt++) {
    await runBatch(filters, out);
    if (!hasReport(out)) {
      console.error(
        `a11y-scan: batch ${n} produced no report (attempt ${attempt})`,
      );
      continue;
    }
    if (attempt === 1) {
      const crashes = crashCount(out);
      if (crashes !== 0) {
        console.error(
          `a11y-scan: batch ${n} has ${crashes} crash-class failure(s) — retrying once`,
        );
        rmSync(out, { force: true });
        continue;
      }
    }
    break;
  }
  if (hasReport(out)) console.log(`  batch ${n}/${batches.length} done`);
  else {
    failed.push(n);
    console.error(`  batch ${n}/${batches.length} FAILED — no report`);
  }
}

const present = batches.filter((_, i) =>
  hasReport(join(OUT, `chunk-${i + 1}.json`)),
).length;
console.log(`a11y-scan: ${present}/${batches.length} batches produced reports`);
if (failed.length > 0) {
  console.error(
    `a11y-scan: ${failed.length} batch(es) produced no report: ${failed.join(" ")}`,
  );
  console.error(`a11y-scan: see ${logFile}. Not reporting on a partial scan.`);
  process.exit(2);
}
