#!/usr/bin/env node
// Claude Code Stop hook: check the comments this turn wrote, before it ends.
//
// Wired up by .claude/settings.json. Exit 2 stops Claude from finishing and shows
// stderr to it, so the comment is fixed inside the same turn and never reaches a
// diff, a CI run, or a reviewer.
//
// Stop rather than PostToolUse, measured over 605 real turns: a run costs the same
// whether it looks at one file or twenty-five, because node startup and one git
// diff dominate and the TS engine is spawned once for the batch. Per write it was
// 40 minutes of hook latency across those turns, and up to 35 seconds inside a
// single heavy one; per turn it is under a second, flat. Half of all writes were
// to a file already written that turn, so most of that work was repeated.
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
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");

// Invoked through Task so the taskfile stays the one place that defines how the
// linter is called.
const TASK_NAME = "pre-commit:comment-lint:hook";
const OFF = new Set(["0", "off", "false", "no"]);

// The linter's own exit codes: 1 when it found something, 2 when its engine could
// not run. The hook's codes mean different things, so they are mapped explicitly.
const FOUND = 1;
const ENGINE_BROKEN = 2;

if (OFF.has((process.env.COMMENT_LINT_HOOK ?? "").toLowerCase())) process.exit(0);

const payload = readStdin();

// Blocking the stop puts Claude back to work, which ends in another stop and
// another chance to block. Claude Code sets this flag once a Stop hook has
// already blocked in this turn, so a rule the agent cannot satisfy costs one
// extra attempt rather than looping. The commit gate still catches whatever
// survives.
if (payload?.stop_hook_active) process.exit(0);

const result = run();
if (result.status === 0) process.exit(0);

if (result.status === ENGINE_BROKEN) {
  process.stderr.write(`comment-lint could not run, so comments in this turn were not checked.${reason(result)}\n`);
  process.exit(1);
}

// Anything else is Task itself failing, which means the check did not happen. A
// findings exit carrying no findings is the same case: Task failed before the
// linter ran, so blocking on it would name comments nobody can go and read.
if (result.status !== FOUND || !result.output.trim()) {
  process.stderr.write(`comment-lint did not run (task exit ${result.status}), so comments in this turn were not checked.${reason(result)}\n`);
  process.exit(1);
}

// The linter's own report already names the file, line, rule and the standard, so
// it is passed through rather than rewritten.
process.stderr.write(`${result.output.trim()}\n\nFix these before finishing.\n`);
process.exit(2);

// Task's stderr names the real failure, such as an executable missing from PATH,
// which the captured pipe would otherwise swallow.
function reason(result) {
  const message = (result.error ?? "").trim();
  return message ? `\n${message}` : "";
}

function readStdin() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return null;
  }
}

// `task` on PATH is a shell wrapper that boots Node to launch the Go binary the
// npm package already ships, which costs about 400ms. Prefer the binary; fall
// back to the wrapper when the layout is not one of the ones probed, or when Task
// came from somewhere else entirely.
function taskCommand() {
  const nodeDir = dirname(process.execPath);
  const exe = process.platform === "win32" ? "task.exe" : "task";
  const candidates = [
    resolve(nodeDir, "node_modules/@go-task/cli/bin", exe),
    resolve(nodeDir, "../lib/node_modules/@go-task/cli/bin", exe),
    resolve(REPO, "node_modules/@go-task/cli/bin", exe),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return { command: candidate, shell: false };
  }
  // Bare name on win32 too: the shell resolves it through PATHEXT, so it finds
  // task.exe, task.cmd or task.bat, whichever the installer shipped.
  return { command: "task", shell: process.platform === "win32" };
}

function run() {
  const { command, shell } = taskCommand();
  try {
    // --output=interleaved because the root Taskfile sets `output: prefixed`,
    // which would put the task name in front of every reported finding.
    // --exit-code because Task otherwise reports its own 201 for any failed task,
    // which hides whether the linter found something or could not run.
    // Task's stderr is captured rather than inherited: it announces its own
    // "Failed to run task" for any non-zero command, which would reach Claude
    // alongside the findings and read as a tooling error.
    const output = execFileSync(command, [TASK_NAME, "--silent", "--output=interleaved", "--exit-code"], {
      cwd: REPO,
      encoding: "utf8",
      maxBuffer: 1 << 26,
      shell,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, output };
  } catch (error) {
    return { status: error.status ?? -1, output: error.stdout ?? "", error: error.stderr ?? "" };
  }
}
