#!/usr/bin/env node

// comment-lint - the comment-quality gate. Standard: devGuide/CODE_COMMENTS.md
//
// Owns .java and engine .py directly, and delegates .ts/.tsx to oxlint (see
// comment-lint-oxlint-plugin.mjs) so the frontend is judged against real comment
// tokens rather than lines. Both paths share the rules in comment-rules.mjs, so
// a finding means the same thing whichever engine produced it.
//
//   node scripts/lint/comment-lint.mjs                 default: everything this
//                                                      working tree adds over HEAD,
//                                                      or over the target branch on CI
//   node scripts/lint/comment-lint.mjs --since main    findings on lines this branch added
//   node scripts/lint/comment-lint.mjs --all           whole tree, report only, never fails
//   node scripts/lint/comment-lint.mjs <paths...>      those files, every line
//   node scripts/lint/comment-lint.mjs --selftest      run the fixture corpus
//                                        --quiet       ...saying nothing unless it fails
//   node scripts/lint/comment-lint.mjs --json          machine-readable findings
//
// Exits non-zero only for a blocking rule on a line in scope. Advisory findings
// are printed and never fail a build. --all never fails, because the tree still
// has a backlog; it is the mode for working through it.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  analyse,
  commentBodiesOf,
  normaliseComment,
  isExcludedPath,
  isGenerated,
  isTestPath,
  ruleLabel,
  RULES,
  SEVERITY,
} from "./comment-rules.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const FRONTEND = join(REPO, "frontend");

// The Python this repo owns and formats: the engine service, plus the helper
// scripts that pre-commit already runs ruff over. Vendored and sample .py
// elsewhere in the tree is not ours to restyle.
const JAVA = /\.java$/;
const PYTHON = /^(engine|scripts|\.github\/scripts)\/.*\.py$/;

// The oxlint engine parses plain JS as happily as TS, so the lint scripts and
// build tooling are held to the same rules as the app.
const TYPESCRIPT = /\.(tsx?|mts|cts|mjs|cjs|jsx?)$/;

const FIXTURES_REL = "scripts/lint/fixtures/";

// oxlint rejects any path containing "..", so it is always run from the repo
// root and given repo-relative paths. Its config still lives under frontend/,
// which is what makes `oxlint` and the plugin resolvable from there.
const OXLINT_BIN = "frontend/node_modules/oxlint/bin/oxlint";
const OXLINT_CONFIG = "frontend/oxlint.comments.config.ts";

// Windows caps a command line at about 32k characters, and the tree holds ~2,900
// TS/JS files, so passing them all at once is 188k and dies with ENAMETOOLONG.
// The failure was silent: oxlint reported nothing and every frontend finding
// vanished. Batching keeps each invocation well under the cap.
const ARGV_BUDGET = 24_000;

// Memoised base-version comment text, keyed by ref:path. Declared up here with
// the other module constants because the top-level run starts before the
// function bodies below it are reached, and a `const` further down would
// still be in its temporal dead zone.
const baseComments = new Map();

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith("--")));
const positional = argv.filter((a) => !a.startsWith("--") && !isFlagValue(a));

if (flags.has("--selftest")) process.exit(runSelfTest());
if (flags.has("--help")) {
  process.stdout.write(
    readFileSync(fileURLToPath(import.meta.url), "utf8")
      .split("\n")
      .slice(1, 22)
      .join("\n")
      .replace(/^\/\/ ?/gm, "") + "\n",
  );
  process.exit(0);
}

const scope = resolveScope();
const findings = collect(scope);
process.exit(publish(findings, scope));

// A "scope" is the set of files to look at plus, when the run is diff-based, the
// set of lines that are new. Reporting a legacy finding in a file someone merely
// touched is how a gate like this gets switched off, so diff runs filter by line.

function resolveScope() {
  if (flags.has("--all")) return { mode: "all", files: trackedFiles(), added: null };

  const paths = positional.map(toRepoPath);

  // Paths plus --since is how the editor hook asks about one file: lint it, but
  // only the lines this session actually wrote.
  if (paths.length > 0 && flags.has("--since")) {
    const ref = mergeBase(flagValue("--since"));
    return narrow(diffScope(["diff", "--unified=0", "--no-color", ref], ref), paths);
  }
  if (paths.length > 0) return { mode: "paths", files: paths, added: null };

  if (flags.has("--since")) {
    const ref = mergeBase(flagValue("--since"));
    return diffScope(["diff", "--unified=0", "--no-color", ref], ref);
  }

  // Always a working-tree comparison, never `--cached`. Findings are read from
  // the file on disk, so diffing the index instead would pair index line numbers
  // with working-tree content and silently mismatch once the two differ.
  // CI knows the target branch; a developer running this before a commit does not.
  const base = process.env.GITHUB_BASE_REF;
  const ref = mergeBase(base ? `origin/${base}` : "HEAD");
  return diffScope(["diff", "--unified=0", "--no-color", ref], ref);
}

function mergeBase(ref) {
  try {
    return git(["merge-base", "HEAD", ref]).trim();
  } catch {
    // A shallow clone or a missing remote ref: compare against the ref itself.
    return ref;
  }
}

function diffScope(args, base) {
  let diff;
  try {
    diff = git(args);
  } catch (error) {
    // A shallow clone, a detached CI checkout, or a base branch that was never
    // fetched. Degrading to report-only beats failing a build over plumbing.
    warn(`could not resolve a diff (${firstLine(error.stderr ?? error.message)}), so nothing was checked.`);
    return { mode: "all", files: [], added: null };
  }

  const added = new Map();
  let file = null;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ")) {
      const path = line.slice(4).replace(/^b\//, "").trim();
      file = path === "/dev/null" ? null : path;
      if (file) added.set(file, new Set());
      continue;
    }
    if (!file || !line.startsWith("@@")) continue;
    const hunk = /\+(\d+)(?:,(\d+))?/.exec(line);
    if (!hunk) continue;
    const start = Number(hunk[1]);
    const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
    for (let i = 0; i < count; i++) added.get(file).add(start + i);
  }

  // git diff never mentions an untracked file, so a brand new one would be waved
  // through entirely. Every line of one is new.
  for (const file of untrackedFiles()) {
    if (added.has(file)) continue;
    added.set(file, allLinesOf(file));
  }

  return { mode: "diff", files: [...added.keys()], added, base };
}

function untrackedFiles() {
  return git(["ls-files", "--others", "--exclude-standard"]).split("\n").filter(Boolean);
}

function allLinesOf(file) {
  const path = join(REPO, file);
  if (!existsSync(path)) return new Set();
  const total = readFileSync(path, "utf8").split(/\r?\n/).length;
  return new Set(Array.from({ length: total }, (_, i) => i + 1));
}

function narrow(scope, paths) {
  const wanted = new Set(paths);
  const added = new Map([...scope.added].filter(([file]) => wanted.has(file)));
  return { mode: "diff", files: [...added.keys()], added, base: scope.base };
}

function trackedFiles() {
  return git(["ls-files"]).split("\n").filter(Boolean);
}

function toRepoPath(path) {
  return relative(REPO, resolve(process.cwd(), path)).replace(/\\/g, "/");
}

function collect(scope) {
  const selected = scope.files.map((f) => f.replace(/\\/g, "/")).filter(isLintable);
  const results = [];

  for (const file of selected.filter((f) => JAVA.test(f) || PYTHON.test(f))) {
    results.push(...lintLineBased(file));
  }

  const ts = selected.filter((f) => TYPESCRIPT.test(f));
  if (ts.length > 0) results.push(...lintTypeScript(ts));

  if (scope.added) {
    const onAddedLine = results.filter((r) => scope.added.get(r.file)?.has(r.line));
    return onAddedLine.filter((r) => !existedAtBase(r, scope.base));
  }
  return results;
}

// git marks a reindented or moved line as added, so line membership alone reports
// comments nobody wrote: a whitespace-only reformat of PageImageLocator.java
// turned a pre-existing banner into a blocking error. A finding only counts if
// its comment text is not already in the file at the base.
//
// Cost is one `git show` per file, memoised. The one thing it gets wrong is
// adding a further copy of an already-duplicated comment, which it treats as
// pre-existing. That is the right way round for a blocking rule.

function existedAtBase(finding, base) {
  if (!base) return false;
  // Findings from the oxlint plugin arrive without their comment text, because
  // they cross a process boundary as a message string. Recover it from the file
  // on disk at the reported line, which is the same text the rule judged.
  const body = finding.body ?? currentLineBody(finding);
  if (!body) return false;
  const key = `${base}:${finding.file}`;
  if (!baseComments.has(key)) {
    let source = "";
    try {
      source = git(["show", key]);
    } catch {
      // Not in the base at all, so the whole file is new.
    }
    baseComments.set(key, commentBodiesOf(source));
  }
  return baseComments.get(key).has(body);
}

function currentLineBody(finding) {
  try {
    const line = readFileSync(join(REPO, finding.file), "utf8").split(/\r?\n/)[finding.line - 1];
    return line === undefined ? "" : normaliseComment(line);
  } catch {
    return "";
  }
}

function isLintable(file) {
  if (isExcludedPath(file)) return false;

  // The corpus is deliberately full of findings. Only the selftest reads it,
  // and it does so by path rather than through this filter.
  if (file.startsWith(FIXTURES_REL)) return false;
  if (!JAVA.test(file) && !PYTHON.test(file) && !TYPESCRIPT.test(file)) return false;
  return existsSync(join(REPO, file));
}

function lintLineBased(file) {
  const source = readFileSync(join(REPO, file), "utf8");
  if (isGenerated(source)) return [];
  const lines = source.split(/\r?\n/);
  const runs = readRuns(lines, PYTHON.test(file) ? "py" : "java");
  return analyse({ lines, runs, isTestFile: isTestPath(file) }).map((f) => ({ ...f, file }));
}

// Groups comment lines into runs, the same shape the oxlint plugin builds from
// parser tokens. String literals are blanked first so a `//` inside one is not
// mistaken for a comment; without that, every URL in a string became a finding.
function readRuns(lines, language) {
  const runs = [];
  let current = null;
  let inBlock = false;

  const push = (index, column, body, kind) => {
    const line = index + 1;
    if (current && current.endLine === line - 1 && current.kind === kind) {
      current.lines.push({ line, column, body });
      current.endLine = line;
      return;
    }
    current = { startLine: line, endLine: line, kind, lines: [{ line, column, body }] };
    runs.push(current);
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const text = blankStrings(raw, language);
    const trimmed = text.trim();
    const column = raw.length - raw.trimStart().length + 1;

    if (inBlock) {
      push(i, column, stripDocPrefix(raw), "doc");
      if (trimmed.includes("*/")) inBlock = false;
      continue;
    }
    if (trimmed.length === 0) {
      current = null;
      continue;
    }
    if (language === "py") {
      if (trimmed.startsWith("#")) push(i, column, raw.trim().replace(/^#+/, ""), "line");
      else current = null;
      continue;
    }
    if (trimmed.startsWith("/*")) {
      push(i, column, stripDocPrefix(raw), trimmed.startsWith("/**") ? "doc" : "block");
      if (!trimmed.includes("*/")) inBlock = true;
      continue;
    }
    if (trimmed.startsWith("//")) {
      push(i, column, raw.trim().replace(/^\/\/+/, ""), "line");
      continue;
    }
    current = null;
  }

  return runs;
}

function stripDocPrefix(raw) {
  return raw
    .trim()
    .replace(/^\/\*+/, "")
    .replace(/\*+\/$/, "")
    .replace(/^\*+/, "")
    .trim();
}

// Replaces the contents of string and char literals with spaces, preserving
// length so columns stay correct. Escapes are honoured so "\"" does not end it.
function blankStrings(line, language) {
  if (language === "py") return line;
  let out = "";
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === "\\") {
        out += "  ";
        i++;
        continue;
      }
      out += ch === quote ? ch : " ";
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      out += ch;
      continue;
    }
    if (ch === "/" && line[i + 1] === "/") return out + line.slice(i);
    out += ch;
  }
  return out;
}

function lintTypeScript(files) {
  if (!existsSync(join(REPO, OXLINT_BIN))) {
    warn("frontend/node_modules/oxlint is missing, so TS/TSX was skipped. Run `task frontend:install`.");
    return [];
  }
  return batch(files, ARGV_BUDGET).flatMap(runOxlint);
}

function batch(files, budget) {
  const batches = [];
  let current = [];
  let size = 0;
  for (const file of files) {
    if (current.length > 0 && size + file.length + 1 > budget) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(file);
    size += file.length + 1;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

function runOxlint(files) {
  let stdout;
  try {
    // Invoked as `node <bin>` rather than through npx: spawning a .cmd shim on
    // Windows fails with EINVAL unless a shell is used, and a shell would mean
    // quoting every path. It must also be the npm package rather than the
    // standalone release binary, which accepts a jsPlugins config, skips loading
    // it, and still reports success (oxc-project/oxc#25203).
    stdout = execFileSync(process.execPath, [OXLINT_BIN, "--config", OXLINT_CONFIG, "--format=json", ...files], {
      cwd: REPO,
      encoding: "utf8",
      maxBuffer: 1 << 28,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    // oxlint exits non-zero whenever it reports something, which is the normal case.
    stdout = error.stdout ?? "";
    if (!stdout.trim()) {
      die(`oxlint failed on ${files.length} file(s): ${firstLine(error.stderr ?? error.message)}`);
    }
  }

  return parseOxlint(stdout);
}

function firstLine(value) {
  return value.toString().trim().split(/\r?\n/)[0];
}

function parseOxlint(stdout) {
  const start = stdout.indexOf("{");
  if (start < 0) die("oxlint produced no JSON report.");
  let report;
  try {
    report = JSON.parse(stdout.slice(start));
  } catch {
    die("could not parse oxlint JSON output.");
  }

  // JS plugins are alpha, and their documented failure mode is being skipped
  // silently while oxlint still reports success (oxc-project/oxc#25203).
  // number_of_rules is the report saying whether the plugin's rule was actually
  // registered. Without this check a dead plugin reads exactly like clean code.
  if ((report.number_of_rules ?? 0) < 1) {
    die("oxlint loaded no rules, so the comment plugin did not run. Refusing to report a pass.");
  }

  return (report.diagnostics ?? []).flatMap((d) => {
    const parsed = /^(CMT\d{3})\s+(\S+)(\s+\(advisory\))?:\s*(.*)$/.exec(d.message);
    if (!parsed) return [];
    const [, rule, , advisory, detail] = parsed;
    const span = d.labels?.[0]?.span;
    return [
      {
        file: d.filename.replace(/\\/g, "/"),
        line: span?.line ?? 1,
        column: span?.column ?? 1,
        rule,
        detail,
        severity: advisory ? SEVERITY.WARN : RULES[rule].severity,
      },
    ];
  });
}

function publish(findings, scope) {
  if (flags.has("--json")) {
    process.stdout.write(`${JSON.stringify({ mode: scope.mode, findings }, null, 2)}\n`);
    return 0;
  }

  const blocking = findings.filter((f) => f.severity === SEVERITY.ERROR);
  const advisory = findings.filter((f) => f.severity === SEVERITY.WARN);

  if (findings.length === 0) {
    process.stdout.write(`comment-lint: clean (${scope.files.length} file${scope.files.length === 1 ? "" : "s"} in scope)\n`);
    return 0;
  }

  const byFile = new Map();
  for (const f of findings) {
    if (!byFile.has(f.file)) byFile.set(f.file, []);
    byFile.get(f.file).push(f);
  }

  for (const [file, group] of [...byFile.entries()].sort()) {
    process.stdout.write(`\n${file}\n`);
    for (const f of group.sort((a, b) => a.line - b.line)) {
      const tag = f.severity === SEVERITY.ERROR ? "error  " : "advisory";
      process.stdout.write(`  ${tag} ${String(f.line).padStart(5)}  ${ruleLabel(f.rule)}  ${f.detail}\n`);
    }
  }

  process.stdout.write(
    `\ncomment-lint: ${blocking.length} blocking, ${advisory.length} advisory, across ${byFile.size} file${byFile.size === 1 ? "" : "s"}\n`,
  );

  if (scope.mode === "all") {
    process.stdout.write("Report-only mode: --all never fails, so the standing backlog can be worked through in chunks.\n");
    return 0;
  }
  if (blocking.length === 0) return 0;

  process.stdout.write(
    "\nThe standard is devGuide/CODE_COMMENTS.md. A comment must carry information the\n" +
      "code cannot; if a reader could derive it from the code in front of them, delete it.\n" +
      "If a finding is genuinely wrong, put `comment-lint-allow: CMT00X` on the line above.\n",
  );
  return 1;
}

function warn(message) {
  process.stderr.write(`comment-lint: ${message}\n`);
}

// A gate that cannot run must not report a pass. Reserved for the engine being
// broken, as opposed to absent: a missing oxlint install is handled by skipping
// with a warning, so the hook stays usable before `task frontend:install`.
function die(message) {
  process.stderr.write(`comment-lint: ${message}\n`);
  process.exit(2);
}

// The fixture corpus is the contract between the two engines: the same rule set
// applied to .java/.py by the line scanner and to .ts/.tsx by oxlint, with
// fixtures/expected.json asserting what each file should produce.
//
// Expectations live outside the fixtures on purpose. An in-file marker would sit
// inside the very comment under test, changing its word count and its run
// length, so the fixture would stop being an example of the real thing.
//
//   --selftest            compare against expected.json
//   --selftest --update   rewrite expected.json from current behaviour
//
// A rule change is meant to show up as a reviewable diff in expected.json.

function runSelfTest() {
  const dir = join(HERE, "fixtures");
  const expectedPath = join(dir, "expected.json");
  const files = readdirSync(dir)
    .filter((f) => /\.(java|py|ts|tsx)$/.test(f))
    .sort();
  if (files.length === 0) {
    warn("no fixtures found");
    return 1;
  }

  const asRepoPath = (name) => relative(REPO, join(dir, name)).replace(/\\/g, "/");
  const tsFixtures = files.filter((f) => TYPESCRIPT.test(f));
  const tsFindings = tsFixtures.length > 0 ? lintTypeScript(tsFixtures.map(asRepoPath)) : [];

  // A skipped engine looks exactly like a clean engine in the snapshot, so
  // refuse to record or compare rather than baking in a false pass.
  if (tsFixtures.length > 0 && tsFindings.length === 0) {
    warn("the TS engine produced nothing, so it did not run. Install frontend deps first.");
    return 1;
  }

  const actual = {};
  for (const name of files) {
    const found = TYPESCRIPT.test(name)
      ? tsFindings.filter((f) => f.file.endsWith(`/${name}`))
      : lintLineBased(asRepoPath(name));
    actual[name] = found
      .map((f) => `${f.line}:${f.rule}:${f.severity}`)
      .sort((a, b) => Number(a.split(":")[0]) - Number(b.split(":")[0]));
  }

  if (flags.has("--update")) {
    writeFileSync(expectedPath, `${JSON.stringify(actual, null, 2)}\n`);
    process.stdout.write(
      `comment-lint selftest: recorded ${Object.keys(actual).length} fixtures to ${relative(REPO, expectedPath)}\n`,
    );
    return 0;
  }

  if (!existsSync(expectedPath)) {
    warn("fixtures/expected.json is missing. Run --selftest --update to record it.");
    return 1;
  }

  // --quiet says nothing unless something is wrong. It is how the lint tasks run
  // the corpus first without burying their own output under eleven ok lines.
  const quiet = flags.has("--quiet");
  const expected = JSON.parse(readFileSync(expectedPath, "utf8"));
  let failures = 0;
  for (const name of files) {
    const want = (expected[name] ?? []).join(" | ");
    const got = actual[name].join(" | ");
    if (want === got) {
      if (!quiet) process.stdout.write(`ok    ${name} (${actual[name].length})\n`);
      continue;
    }
    failures++;
    process.stdout.write(`FAIL  ${name}\n        expected: ${want || "(nothing)"}\n        actual:   ${got || "(nothing)"}\n`);
  }

  const stale = Object.keys(expected).filter((n) => !files.includes(n));
  for (const name of stale) {
    failures++;
    process.stdout.write(`FAIL  ${name} is in expected.json but the fixture is gone\n`);
  }

  if (failures > 0) {
    process.stdout.write(
      `\ncomment-lint selftest: ${failures} fixture(s) differ. If intended, rerun with --update and review the diff.\n`,
    );
    return 1;
  }
  if (!quiet) process.stdout.write("\ncomment-lint selftest: both engines match the corpus\n");
  return 0;
}

function isFlagValue(arg) {
  const index = argv.indexOf(arg);
  return index > 0 && argv[index - 1] === "--since";
}

function flagValue(flag) {
  const index = argv.indexOf(flag);
  return argv[index + 1] ?? "origin/main";
}

function git(args) {
  // stderr is captured rather than inherited so git's line-ending advice ("CRLF
  // will be replaced by LF") does not print once per file on Windows. Real
  // failures still surface: execFileSync throws, and the caller reads .stderr.
  return execFileSync("git", args, {
    cwd: REPO,
    encoding: "utf8",
    maxBuffer: 1 << 28,
    stdio: ["ignore", "pipe", "pipe"],
  });
}
