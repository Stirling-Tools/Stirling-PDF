#!/usr/bin/env node
// Claude Code PostToolUse hook: check the comments in the file just written.
//
// Wired up by .claude/settings.json on Edit|Write. The tool has already run, so
// this cannot block the write; exit 2 shows stderr to Claude, which then fixes
// the comment in the same turn. That is the point: the comment never reaches a
// diff, a CI run, or a reviewer.
//
// Scoped to lines that differ from HEAD, so editing an old file does not dredge
// up the standing backlog. Advisory findings are silent here; nagging on every
// keystroke is how a hook gets turned off.
//
// To turn it off, set COMMENT_LINT_HOOK=0. Claude Code has no way to disable one
// hook (only disableAllHooks, which turns off everyone's), so the opt-out lives
// here instead. Per developer, in .claude/settings.local.json:
//
//   { "env": { "COMMENT_LINT_HOOK": "0" } }
//
// The commit-time gate still applies either way, so opting out costs you the
// early warning, not the check.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
// Invoked through Task so the taskfile stays the one place that defines how the
// linter is called. Costs roughly 350ms per edit over calling node directly,
// because Task here is the npm-wrapped launcher rather than the Go binary.
const TASK_NAME = "pre-commit:comment-lint:hook";
const REPO = resolve(HERE, "..", "..");
const LINTABLE = /\.(tsx?|mts|cts|mjs|cjs|jsx?|java|py)$/;
const OFF = new Set(["0", "off", "false", "no"]);

if (OFF.has((process.env.COMMENT_LINT_HOOK ?? "").toLowerCase())) process.exit(0);

const payload = readStdin();
const file = payload?.tool_input?.file_path;
if (!file || !LINTABLE.test(file)) process.exit(0);

let report;
try {
  report = JSON.parse(run(file));
} catch (error) {
  // The linter exits 2 when its engine is broken rather than when it found
  // something, which for the hook means it checked nothing. Say so once, as a
  // non-blocking error, instead of looking indistinguishable from clean. Any
  // other failure stays silent: a broken hook must not stall the session.
  if (error.status === 2) {
    process.stderr.write("comment-lint could not run, so comments in this file were not checked.\n");
    process.exit(1);
  }
  process.exit(0);
}

const blocking = (report.findings ?? []).filter((f) => f.severity === "error");
if (blocking.length === 0) process.exit(0);

const lines = blocking.map((f) => `  ${f.file}:${f.line}  ${f.rule} ${f.detail}`);
process.stderr.write(
  `comment-lint found ${blocking.length} comment${blocking.length === 1 ? "" : "s"} to fix:\n` +
    `${lines.join("\n")}\n\n` +
    "A comment must carry information the code cannot. If a reader could derive it\n" +
    "from the code in front of them, delete it. Banners and commented-out code go too.\n" +
    "The standard is devGuide/CODE_COMMENTS.md. Fix these before moving on.\n",
);
process.exit(2);

function readStdin() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return null;
  }
}

function run(file) {
  const task = process.platform === "win32" ? "task.cmd" : "task";
  try {
    // --output=interleaved because the root Taskfile sets `output: prefixed`,
    // which would prepend the task name to every line of the JSON.
    return execFileSync(task, [TASK_NAME, `FILE=${file}`, "--silent", "--output=interleaved"], {
      cwd: REPO,
      encoding: "utf8",
      maxBuffer: 1 << 26,
      shell: process.platform === "win32",
    });
  } catch (error) {
    // The CLI exits non-zero when it finds something, and still prints the JSON.
    if (error.stdout) return error.stdout;
    throw error;
  }
}
