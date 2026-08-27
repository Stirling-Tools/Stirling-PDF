// oxlint JS plugin: the comment-quality rules for .ts and .tsx.
//
// This engine owns the frontend outright; comment-lint.mjs never scans TS. The
// reason to run oxlint here rather than scan lines is that comment tokens come
// from the parser, so a `//` inside a string or regex is not a comment, JSX
// `{/* … */}` is, and positions are exact. Rule decisions themselves live in
// comment-rules.mjs, shared with the Java/Python engine.
//
// Reported as one rule with the CMT id in the message, because oxlint config
// severity is per rule name and every finding here shares one on/off switch.
//
// Enabled by frontend/oxlint.comments.config.ts. `context.report` needs
// `node.range`; passing start/end throws.

import { analyse, isTestPath, isGenerated, isExcludedPath, ruleLabel } from "./comment-rules.mjs";

const comments = {
  create(context) {
    return {
      "Program:exit"() {
        const sourceCode = context.sourceCode;
        const filename = context.filename ?? context.getFilename?.() ?? "";
        if (isExcludedPath(filename)) return;

        const text = sourceCode.text;
        if (isGenerated(text)) return;

        const lines = sourceCode.getLines();
        const tokens = sourceCode.getAllComments();
        if (tokens.length === 0) return;

        const runs = groupIntoRuns(tokens, lines);
        const findings = analyse({ lines, runs, isTestFile: isTestPath(filename) });

        // Ranges come from the run entries rather than the enclosing token, so a
        // finding on the eighth line of a doc block points at that line instead
        // of at the opening `/**`.
        const ranges = new Map();
        for (const run of runs) {
          for (const entry of run.lines) ranges.set(entry.line, entry.range);
        }

        for (const finding of findings) {
          context.report({
            message: `${ruleLabel(finding.rule)}: ${finding.detail}`,
            node: { type: "Line", range: ranges.get(finding.line) ?? [0, 1] },
          });
        }
      },
    };
  },
};

// Adjacent comment lines with no code between them form one run, which is the
// unit the block-length and dead-code rules judge. A comment sharing its line
// with code is a trailing note, not part of any run.
function groupIntoRuns(tokens, lines) {
  const runs = [];
  let current = null;

  for (const token of tokens) {
    const entries = expand(token, lines);
    if (entries.length === 0) continue;

    const kind = token.type === "Line" ? "line" : token.value.startsWith("*") ? "doc" : "block";
    const startLine = entries[0].line;
    const trailing = entries[0].trailing === true;
    const contiguous = !trailing && current && startLine === current.endLine + 1 && current.kind === kind && !current.trailing;

    if (contiguous) {
      current.lines.push(...entries);
      current.endLine = entries[entries.length - 1].line;
      continue;
    }
    current = { startLine, endLine: entries[entries.length - 1].line, kind, trailing, lines: entries };
    runs.push(current);

    // Code sits in front of a trailing comment, so nothing can continue it.
    if (trailing) current = null;
  }

  return runs;
}

// One entry per physical line, with the leading `*` of a doc block stripped so
// the rules see the prose rather than the box drawing around it. Each entry
// carries its own source range so findings can be reported where they are.
function expand(token, lines) {
  const start = token.loc.start.line;
  const column = token.loc.start.column + 1;
  const before = (lines[start - 1] ?? "").slice(0, token.loc.start.column).trim();

  // Code in front of the comment makes it a trailing note. Marked rather than
  // dropped, so CMT004 and CMT009 still see it: a TODO is a TODO wherever it
  // sits. The rules that compare a comment against the code below it stay out,
  // because a trailing comment usually decodes the line it sits on.
  //
  // A block comment counts as trailing only when it also closes on that line.
  // One that runs on has its bulk on lines of its own, so it is judged as the
  // block it is.
  const sameLine = token.loc.start.line === token.loc.end.line;
  const trailing = before.length > 0 && !before.startsWith("{") && (token.type === "Line" || sameLine);

  if (token.type === "Line") {
    return [{ line: start, column, body: token.value, range: token.range, trailing }];
  }

  // token.value is the text between the delimiters, so it begins two chars in.
  let offset = token.range[0] + 2;
  return token.value.split("\n").map((raw, index) => {
    const range = [offset, offset + Math.max(raw.length, 1)];
    offset += raw.length + 1;
    return {
      line: start + index,
      column: index === 0 ? column : 1,
      body: raw.replace(/^\s*\*+/, "").trim(),
      range,
      trailing,
    };
  });
}

export default {
  meta: { name: "comments" },
  rules: { quality: comments },
};
