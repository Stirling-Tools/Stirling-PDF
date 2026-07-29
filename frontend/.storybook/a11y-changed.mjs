// Prints the story files a branch affects, one per line — the scan set for the
// pull-request a11y gate. A story is affected if its file changed against the
// base ref (or is uncommitted/untracked), or if a same-named sibling source
// file changed: stories render the live component, so editing Button.tsx or
// Button.css changes what Button.stories.tsx shows without touching it.
//
//   node a11y-changed.mjs [base-ref]     (default origin/main)
//
// Node rather than shell so the task works no matter what invokes it — Task's
// embedded interpreter runs on Windows, but sed/grep/sort do not exist for
// developers calling tasks from PowerShell.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const base = process.argv[2] || "origin/main";

const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8" })
    .split("\n")
    .map((l) => l.trim().replace(/^frontend\//, ""))
    .filter(Boolean);

const STORY = /\.stories\.tsx?$/;
const TEST = /\.test\.tsx?$/;
const SOURCE = /\.(ts|tsx|css)$/;

// Committed changes vs the base, plus working-tree changes, plus untracked
// files — so the gate covers exactly what the branch would merge and what a
// developer is about to commit.
const changed = [
  ...git("diff", "--name-only", "--diff-filter=d", `${base}...HEAD`),
  ...git("diff", "--name-only", "--diff-filter=d"),
  ...git("ls-files", "--others", "--exclude-standard"),
];

const stories = new Set();
for (const f of changed) {
  if (STORY.test(f)) {
    stories.add(f);
    continue;
  }
  if (TEST.test(f) || !SOURCE.test(f)) continue;
  const sibling = f.replace(SOURCE, "");
  for (const s of [`${sibling}.stories.tsx`, `${sibling}.stories.ts`])
    if (existsSync(s)) stories.add(s);
}

// One line, each path quoted: the output is interpolated into a task command,
// where a newline would end the command after the first story and an unquoted
// space would split a path into two arguments.
process.stdout.write(
  [...stories]
    .sort()
    .map((s) => `"${s}"`)
    .join(" "),
);
