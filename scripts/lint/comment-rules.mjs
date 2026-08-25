// The comment-quality rule set, shared by both engines so a rule means the same
// thing everywhere: the oxlint JS plugin (which owns .ts/.tsx, and has real
// comment tokens and an AST) and comment-lint.mjs (which owns .java and .py, and
// has only lines). Neither engine ever scans the other's files, so the two can
// differ in precision without producing contradictory findings on one file.
//
// The standard these rules enforce is devGuide/CODE_COMMENTS.md. Changing a rule
// here without changing that document leaves the repo with two answers.

export const SEVERITY = { ERROR: "error", WARN: "warn" };

// A rule blocks only when every finding it can produce is wrong by construction:
// a comment echoing its own next line, decoration, dead code. The rest have a
// legitimate form no pattern separates from the bad one, so they advise. Blocking
// those would teach people to delete good comments to get a build green. The
// reason each one advises is on the rule itself.
export const RULES = {
  CMT001: { name: "restates-code", severity: SEVERITY.ERROR },
  CMT002: { name: "banner", severity: SEVERITY.ERROR },
  CMT005: { name: "dead-code", severity: SEVERITY.ERROR },
  CMT003: { name: "step-narration", severity: SEVERITY.WARN },
  CMT004: { name: "diff-narration", severity: SEVERITY.WARN },
  CMT006: { name: "block-too-long", severity: SEVERITY.WARN },
  CMT007: { name: "doc-restates-signature", severity: SEVERITY.WARN },
  CMT008: { name: "shouty-marker", severity: SEVERITY.WARN },
  CMT009: { name: "unowned-todo", severity: SEVERITY.WARN },
};

export const MAX_BLOCK_LINES = 12;

// CMT001 compares a comment against the code it introduces. Both sides are
// reduced to the same shape first: lowercased, camel/snake/kebab split into
// words, stop words and short words dropped. What survives is the information
// each side actually carries, so "Handle drag start" and `handleDragStart` land
// on the same set and the comment is shown to add nothing.

const STOP_WORDS = new Set(
  (
    "a an the and or but if then else for to of in on at by with from into is are be was were this that these those it its as we our you your do" +
    " does done use uses used using will would should can could may might not no yes new only also just so such via per each all any some more" +
    " most other another same when while where which what who how why here there now next finally first second third let const var function" +
    " return set get"
  ).split(" "),
);

const WORD_RE = /[a-z][a-z0-9]*/g;

export function contentWords(text) {
  return (text.toLowerCase().match(WORD_RE) ?? []).filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

export function identWords(text) {
  const split = text.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_\-.]/g, " ");
  return contentWords(split);
}

// Sentence punctuation marks prose, which is usually saying something the code
// does not. A single trailing full stop does not count.
const PROSE_PUNCT = /[.;:?!]/;
const MAX_RESTATE_WORDS = 6;

// Arrange/Act/Assert and Given/When/Then label the shape of a test rather than
// describe the line beneath. Exempt only as a bare marker, so
// `// Assert the cap is clamped to the tier maximum` is prose and judged on its
// merits.
const TEST_STRUCTURE = /^(arrange|act|assert|given|when|then)\b/i;
const MAX_MARKER_WORDS = 4;

export function restatesCode(body, codeText) {
  if (TEST_STRUCTURE.test(body.trim()) && body.trim().split(/\s+/).length <= MAX_MARKER_WORDS) return false;
  if (PROSE_PUNCT.test(body.replace(/\.$/, ""))) return false;
  const comment = contentWords(body);
  if (comment.length === 0 || comment.length > MAX_RESTATE_WORDS) return false;
  const code = identWords(codeText);
  if (code.length === 0) return false;

  // Prefix matching either way, so "config" covers "configuration" and vice versa.
  return comment.every((w) => code.some((k) => k.startsWith(w) || w.startsWith(k)));
}

const RULE_CHARS = /^[=~_*#+\-]{4,}|[─-╿]{4,}|[=~_*+]{4,}$/;
const SECTION_LABEL = new RegExp(
  "^(imports?|exports?|types?|interfaces?|constants?|config|helpers?|utils?|utilities|state|handlers?|callbacks?|effects?" +
    "|render|rendering|styles?|props?|hooks?|setup|teardown|cleanup|main|public|private|internal|api|queries|mutations" +
    "|selectors?|actions?|reducers?|components?|fields?|getters?|setters?|lifecycle|boilerplate)" +
    "\\s*(section|area|block)?\\s*$",
  "i",
);

export function isBanner(body) {
  if (RULE_CHARS.test(body.trim())) return true;

  // A label wrapped in decoration is still a label: strip the decoration first.
  const bare = body
    .replace(/[=~_*#+\-─-╿]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return bare.length > 0 && SECTION_LABEL.test(bare);
}

// A bare "1." is not narration: numbered lists are how a doc block enumerates
// conditions or alternatives, and matching them buries the rule in false
// positives. Only the explicit step form and sequencing adverbs qualify.
const STEP = /^(step\s*\d+\b|(then|next|finally|afterwards|lastly)\s*[,:]\s+\S)/i;

export function isStepNarration(body) {
  return STEP.test(body.trim());
}

// Only phrases that can be talking about the code's own past. Excluded because
// each has an innocent reading that fires constantly:
//   "used to" alone    - "Used to clamp the live line" means "is used to"
//   "previously" alone - "re-show even if previously dismissed" is runtime state
//   "was called"       - collides with "verify getSession was called"
//   "left over from"   - "no cards left over from the unfiltered grid"
const DIFF_NARRATION = new RegExp(
  "\\b((this|it|we|they|that) used to|used to (be|live|sit)" +
    "|no longer (needed|required|used|necessary|relevant)" +
    "|renamed from|was (previously|formerly) (called|named|known)" +
    "|instead of the old|has been (removed|replaced) )",
  "i",
);
const REMOVAL_SUFFIX = /(^|\s)[-(—]\s*(removed|deleted|dropped|no longer needed)\s*\)?\s*$/i;

export function isDiffNarration(body) {
  const t = body.trim();
  return DIFF_NARRATION.test(t) || REMOVAL_SUFFIX.test(t);
}

const CODE_KEYWORD = new RegExp(
  "^(import|package|public|private|protected|static|final|abstract|class|interface|enum|record|extends|implements" +
    "|def|async|await|const|let|var|function|export|return|if|else|elif|for|while|do|try|catch|finally|switch|case" +
    "|throw|new|super|this|@[A-Za-z])\\b",
);
const STATEMENT_TAIL = /[;{}]\s*$/;
const CALL_ONLY = /^[\w.$]+\s*\([^)]*\)\s*;?\s*$/;
const ASSIGNMENT = /\S\s*=\s*\S/;

export function looksLikeCode(line) {
  const t = line.trim();
  if (t.length === 0) return false;
  if (CODE_KEYWORD.test(t)) return true;
  if (CALL_ONLY.test(t)) return true;
  return STATEMENT_TAIL.test(t) && ASSIGNMENT.test(t);
}

export const MIN_DEAD_CODE_RUN = 3;
const DEAD_CODE_SHARE = 2 / 3;

export function isDeadCodeRun(bodies) {
  if (bodies.length < MIN_DEAD_CODE_RUN) return false;
  const codeish = bodies.filter(looksLikeCode).length;
  return codeish / bodies.length >= DEAD_CODE_SHARE;
}

const PARAM_TAG = /^@param\s+(?:\{[^}]*\}\s+)?([\w$.]+)\s*-?\s*(.+)$/;
const RETURN_TAG = /^@returns?\s+(.+)$/;

// Description adds nothing when every word in it already appears in the thing
// being described. `@param blob - The blob to download` is the canonical case.
export function docRestatesSignature(body, ownerName = "") {
  const t = body.trim();
  const param = PARAM_TAG.exec(t);
  if (param) {
    const [, name, description] = param;
    const words = contentWords(description);
    if (words.length === 0 || words.length > 5) return false;
    const known = identWords(name);
    return known.length > 0 && words.every((w) => known.some((k) => k.startsWith(w) || w.startsWith(k)));
  }
  const returns = RETURN_TAG.exec(t);
  if (returns && ownerName) {
    const words = contentWords(returns[1]);
    if (words.length === 0 || words.length > 4) return false;
    const known = identWords(ownerName);
    return known.length > 0 && words.every((w) => known.some((k) => k.startsWith(w) || w.startsWith(k)));
  }
  return false;
}

// "Note:" is left out: it is an ordinary discourse marker. These are the shouted
// ones, which are the AI tell.
const SHOUTY = /^(important|critical|warning|attention|caution|beware)\s*[:!]/i;

// A marker earns its shout if it points at something checkable.
const HAS_REFERENCE = /(#\d+|https?:\/\/|CVE-\d|GHSA-|[A-Z]{2,}-\d+)/;

export function isShouty(body, runText = body) {
  return SHOUTY.test(body.trim()) && !HAS_REFERENCE.test(runText);
}

// A TODO with no reference has nothing that will ever close it. An owner is not
// accepted in its place: a username goes stale when someone leaves and means
// nothing to an outside contributor, while an issue outlives both.
// Anchored at the start, so this catches a comment that *is* a TODO rather than
// prose that mentions the word.
const TODO_MARKER = /^(TODO|FIXME|HACK|XXX)\b/;

export function isUnownedTodo(body, runText = body) {
  return TODO_MARKER.test(body) && !HAS_REFERENCE.test(runText);
}

// `comment-lint-allow: CMT002` silences one rule, on the comment itself or on
// the line above it. There is deliberately no form that disables every rule.
const ALLOW = /comment-lint-allow:\s*((?:CMT\d{3})(?:\s*,\s*CMT\d{3})*)/gi;

export function allowedRules(text) {
  const found = new Set();
  for (const match of text.matchAll(ALLOW)) {
    for (const id of match[1].split(",")) found.add(id.trim().toUpperCase());
  }
  return found;
}

// Generated files carry whatever the generator emits, and editing them to
// satisfy a lint rule would be undone on the next regeneration.
const GENERATED_MARKER = /AUTO-?GENERATED|@generated|DO NOT EDIT|Code generated by/i;
const GENERATED_HEADER_LINES = 10;

export function isGenerated(source) {
  return GENERATED_MARKER.test(source.split("\n", GENERATED_HEADER_LINES).join("\n"));
}

export const EXCLUDED_PATHS = [
  /(^|\/)node_modules\//,
  /(^|\/)dist(-\w+)?\//,
  /(^|\/)build\//,
  /(^|\/)target\//,
  /(^|\/)vendor\//,
  /pdfjs/i,
  /thirdParty/i,
  /\.min\./,
  /src-tauri\/gen\//,
  /public\/locales\//,
  /\.d\.ts$/,
  /(^|\/)storybook-static\//,
  /(^|\/)playwright-report\//,
  /(^|\/)org\/apache\//,
];

export function isExcludedPath(file) {
  const normalised = file.replace(/\\/g, "/");
  return EXCLUDED_PATHS.some((re) => re.test(normalised));
}

// Comment text reduced to what a reader would call "the same comment": trimmed,
// whitespace collapsed, comment markers and decoration stripped. Both sides of
// the pre-existing check normalise through here so indentation and marker style
// cannot make an unchanged comment look new.
export function normaliseComment(text) {
  return String(text)
    .replace(/^[\s{]*(\/\/+|\/\*+|#+|\*+)/gm, " ")
    .replace(/\*+\/[\s}]*$/gm, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Every comment in a source file, normalised. Deliberately permissive and
// language-agnostic: it only ever decides whether a finding is pre-existing, so
// over-matching suppresses a duplicate comment and under-matching just reports
// something the author can look at.
export function commentBodiesOf(source) {
  const bodies = new Set();
  for (const raw of source.split(/\r?\n/)) {
    const marker = /(\/\/+|\/\*+|^\s*\*+|#+)/.exec(raw);
    if (!marker) continue;
    const body = normaliseComment(raw.slice(marker.index));
    if (body.length > 0) bodies.add(body);
  }
  return bodies;
}

export function ruleLabel(id) {
  return `${id} ${RULES[id].name}`;
}

// Both engines funnel into this. They differ only in how they build `runs`: the
// oxlint plugin reads real comment tokens, comment-lint.mjs scans lines. Keeping
// the rule application here is what stops the two drifting apart.
//
// A "run" is a group of comment lines with no code between them, which is the
// unit CMT005 and CMT006 judge. Shape:
//   { startLine, kind: "line" | "block" | "doc", lines: [{ line, column, body }] }
// `line` is 1-based to match every editor and every diff.

export function analyse({ lines, runs, isTestFile = false }) {
  const findings = [];
  // `body` is the comment's own text, kept alongside the formatted detail so the
  // caller can ask whether this exact comment already existed before the change.
  // That is what stops a reindent or a code move reporting comments nobody wrote.
  const report = (rule, line, column, detail, body) => {
    if (isTestFile && SUPPRESSED_IN_TESTS.has(rule)) return;
    findings.push({ rule, line, column, detail, body: normaliseComment(body ?? detail), severity: RULES[rule].severity });
  };

  for (const run of runs) {
    const bodies = run.lines.map((l) => l.body);
    const runText = bodies.join("\n");
    const allowed = allowedRules(runText + "\n" + precedingLine(lines, run.startLine));

    if (!allowed.has("CMT005") && isDeadCodeRun(bodies)) {
      report("CMT005", run.startLine, run.lines[0].column, `${bodies.length} commented-out lines`, runText);
      continue; // Every other rule would pile onto the same block of dead code.
    }

    if (!allowed.has("CMT006") && run.lines.length > MAX_BLOCK_LINES && run.startLine > FILE_HEADER_LINES) {
      report("CMT006", run.startLine, run.lines[0].column, `${run.lines.length} lines, limit ${MAX_BLOCK_LINES}`, runText);
    }

    const owner = run.kind === "line" ? "" : nextCodeLine(lines, run);

    for (const entry of run.lines) {
      const body = entry.body.trim();
      if (body.length === 0) continue;

      if (!allowed.has("CMT002") && isBanner(body)) {
        report("CMT002", entry.line, entry.column, truncate(body), body);
        continue;
      }
      if (!allowed.has("CMT003") && isStepNarration(body)) {
        report("CMT003", entry.line, entry.column, truncate(body), body);
        continue;
      }
      if (!allowed.has("CMT004") && isDiffNarration(body)) {
        report("CMT004", entry.line, entry.column, truncate(body), body);
        continue;
      }
      if (!allowed.has("CMT007") && docRestatesSignature(body, owner)) {
        report("CMT007", entry.line, entry.column, truncate(body), body);
        continue;
      }
      if (!allowed.has("CMT008") && isShouty(body, runText)) {
        report("CMT008", entry.line, entry.column, truncate(body), body);
        continue;
      }
      if (!allowed.has("CMT009") && isUnownedTodo(body, runText)) {
        report("CMT009", entry.line, entry.column, truncate(body), body);
        continue;
      }
    }

    // CMT001 judges a whole single-line run against the code it introduces, so
    // a two-line comment that happens to echo one identifier is left alone.
    // A one-line `/* … */` counts, which is how JSX `{/* Cap editor */}` above
    // `<CapEditor …>` is caught. A doc block does not: it is a contract, and
    // CMT007 is the rule that judges those.
    if (!allowed.has("CMT001") && run.kind !== "doc" && run.lines.length === 1) {
      const entry = run.lines[0];
      const body = entry.body.trim();
      const code = nextCodeLine(lines, run);
      if (code && !isBanner(body) && restatesCode(body, code)) {
        report("CMT001", entry.line, entry.column, `${truncate(body)}  ->  ${truncate(code)}`, body);
      }
    }
  }

  return findings.sort((a, b) => a.line - b.line || a.column - b.column);
}

// A file header is allowed to be as long as it needs to be.
const FILE_HEADER_LINES = 5;
const DETAIL_WIDTH = 58;

// Both of these say something real in a test and nothing anywhere else. A
// regression test explains itself by describing the old behaviour, and the e2e
// specs number their comments to match a written manual test procedure.
const SUPPRESSED_IN_TESTS = new Set(["CMT003", "CMT004"]);

function precedingLine(lines, startLine) {
  return lines[startLine - 2] ?? "";
}

function nextCodeLine(lines, run) {
  const commentLines = new Set(run.lines.map((l) => l.line));
  for (let i = run.startLine; i < lines.length; i++) {
    const lineNumber = i + 1;
    if (commentLines.has(lineNumber)) continue;
    const text = lines[i]?.trim() ?? "";
    if (text.length === 0) continue;
    if (text.startsWith("//") || text.startsWith("#") || text.startsWith("*") || text.startsWith("/*")) continue;
    if (text === "}" || text === "};" || text === ")" || text === ");") return "";
    return text;
  }
  return "";
}

function truncate(text) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > DETAIL_WIDTH ? `${flat.slice(0, DETAIL_WIDTH - 1)}…` : flat;
}

export const TEST_FILE = /\.(test|spec)\.[jt]sx?$|(^|\/)src\/test\/|Test\.java$|Tests\.java$|(^|\/)test_[^/]+\.py$|_test\.py$/;

export function isTestPath(file) {
  return TEST_FILE.test(file.replace(/\\/g, "/"));
}
