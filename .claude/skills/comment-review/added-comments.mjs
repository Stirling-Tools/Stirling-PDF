#!/usr/bin/env node

// Every comment line a range adds, as `file:line text`, for the review checklist.
//
//   node .claude/skills/comment-review/added-comments.mjs <base-ref> [head-ref]
//
// Line-based on purpose: it over-reports (a `//` inside a string, a `*` opening a
// wrapped expression) rather than miss one, and the reviewer opens the file anyway.
// A shell one-liner cannot do this job: `$0` and `$1` in an awk or perl script are
// rewritten by skill argument interpolation before the shell ever sees them.

import { execFileSync } from "node:child_process";

const [base, head = "HEAD"] = process.argv.slice(2);
if (!base) {
  process.stderr.write("usage: added-comments.mjs <base-ref> [head-ref]\n");
  process.exit(2);
}

const diff = execFileSync("git", ["diff", "-U0", "--no-color", `${base}...${head}`], {
  encoding: "utf8",
  maxBuffer: 1 << 28,
});

const OPENS_COMMENT = /^\+\s*(\/\/|\/\*|\*|#|"""|'''|\{\/\*)/;

let file = null;
let line = 0;
let count = 0;

for (const raw of diff.split("\n")) {
  if (raw.startsWith("+++ ")) {
    file = raw.slice(4).replace(/^b\//, "").trim();
    continue;
  }
  // The new-file start of the hunk. Single-line hunks omit the count, so read the
  // number rather than splitting on the comma that may not be there.
  const hunk = /^@@ .*?\+(\d+)/.exec(raw);
  if (hunk) {
    line = Number(hunk[1]);
    continue;
  }
  if (!raw.startsWith("+")) continue;
  if (OPENS_COMMENT.test(raw)) {
    process.stdout.write(`${file}:${line} ${raw.slice(1).trim()}\n`);
    count += 1;
  }
  line += 1;
}

process.stderr.write(`${count} added comment lines\n`);
