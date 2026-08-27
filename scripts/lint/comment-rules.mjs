// The comment-quality rule set, shared by both engines so a rule means the same
// thing everywhere: the oxlint JS plugin (which owns .ts/.tsx, and has real
// comment tokens and an AST) and comment-lint.mjs (which owns .java and .py, and
// has only lines). Neither engine ever scans the other's files, so the two can
// differ in precision without producing contradictory findings on one file.
//
// The standard these rules enforce is devGuide/CODE_COMMENTS.md. Changing a rule
// here without changing that document leaves the repo with two answers.
//
// Between them the engines read every comment form the repo writes: // and /* */,
// Javadoc and JSDoc, JSX comments, # and Python docstrings.

export const SEVERITY = { ERROR: "error", WARN: "warn" };

// Every rule blocks. A rule that only warns is a rule nobody acts on, so a
// finding that turns out to be wrong is a bug in the rule: narrow it, or mark the
// line with comment-lint-allow and say why. Each rule below carries the readings
// it deliberately excludes, which is where to start when one misfires.
export const RULES = {
  CMT001: { name: "restates-code", severity: SEVERITY.ERROR },
  CMT002: { name: "banner", severity: SEVERITY.ERROR },
  CMT005: { name: "dead-code", severity: SEVERITY.ERROR },
  CMT003: { name: "step-narration", severity: SEVERITY.ERROR },
  CMT004: { name: "diff-narration", severity: SEVERITY.ERROR },
  CMT006: { name: "block-too-long", severity: SEVERITY.ERROR },
  CMT007: { name: "doc-restates-signature", severity: SEVERITY.ERROR },
  CMT009: { name: "unowned-todo", severity: SEVERITY.ERROR },
  CMT010: { name: "bad-allow", severity: SEVERITY.ERROR },
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
// positives. Only the explicit step form and sequencing adverbs qualify, and the
// number needs a separator after it, so a wrapped line beginning "step 2 unmounts
// + remounts the panel" reads as the prose it is.
const STEP = /^(step\s*\d+(\.\d+)?\s*[:.)\-]|(then|next|finally|afterwards|lastly)\s*[,:]\s+\S)/i;

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
    "|(this|it|that|which|the (class|method|field|code|file|module|palette|banner)) is no longer (needed|used)" +
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

// Every documented-parameter form this repo writes, so the rule is not quietly
// Javadoc-only:
//   Javadoc / JSDoc   @param blob The blob to download
//   Sphinx            :param blob: The blob to download
//   Google docstring  blob: The blob to download        (under an Args: heading)
// NumPy style is deliberately absent: it splits the name and the description
// across two lines, and there is one instance of it in the tree.
const PARAM_TAG = /^@param\s+(?:\{[^}]*\}\s+)?([\w$.]+)\s*-?\s*(.+)$/;
const SPHINX_PARAM = /^:(?:param|arg|key)\s+(?:\S+\s+)?([\w.]+)\s*:\s*(.+)$/;
const GOOGLE_PARAM = /^([a-z_][\w]*)\s*(?:\([^)]*\))?\s*:\s*(.+)$/;

const RETURN_TAG = /^@returns?\s+(.+)$/;
const SPHINX_RETURN = /^:returns?\s*:\s*(.+)$/;

// Description adds nothing when every word in it already appears in the thing
// being described. `@param blob - The blob to download` is the canonical case.
//
// No native linter covers this. eslint-plugin-jsdoc's require-param-description,
// Checkstyle's NonEmptyAtclauseDescription and ruff's D-rules all check that a
// description exists, not whether it says anything.
export function docRestatesSignature(body, ownerName = "") {
  const t = body.trim();

  for (const pattern of [PARAM_TAG, SPHINX_PARAM, GOOGLE_PARAM]) {
    const match = pattern.exec(t);
    if (!match) continue;
    const [, name, description] = match;
    // Google form is just `name: description`, which also matches ordinary prose
    // containing a colon. Require the description to be short and unpunctuated so
    // "Note: the cap is clamped" is not read as a parameter called "note".
    if (pattern === GOOGLE_PARAM && /[.;,]/.test(description)) return false;
    return addsNothing(description, name, 5);
  }

  const returns = RETURN_TAG.exec(t) ?? SPHINX_RETURN.exec(t);
  if (returns && ownerName) return addsNothing(returns[1], ownerName, 4);
  return false;
}

function addsNothing(description, subject, limit) {
  const words = contentWords(description);
  if (words.length === 0 || words.length > limit) return false;
  const known = identWords(subject);
  return known.length > 0 && words.every((w) => known.some((k) => k.startsWith(w) || w.startsWith(k)));
}

// A TODO with no reference has nothing that will ever close it. An owner is not
// accepted in its place: a username goes stale when someone leaves and means
// nothing to an outside contributor, while an issue outlives both.
//
// Anchored at the start, so this catches a comment that *is* a TODO rather than
// prose that mentions the word.
const TODO_MARKER = /^(TODO|FIXME|HACK|XXX)\b/;

// What counts as something that will close it: an issue, a link, or a security
// advisory. Checked across the whole comment run, so the reference can sit on a
// continuation line.
const HAS_REFERENCE = /(#\d+|https?:\/\/|CVE-\d|GHSA-|[A-Z]{2,}-\d+)/;

export function isUnownedTodo(body, runText = body) {
  return TODO_MARKER.test(body) && !HAS_REFERENCE.test(runText);
}

// A rule id is silenced by `comment-lint-allow: CMT002`, on the comment itself or
// on the line above it. There is deliberately no form that disables every rule.
//
// The whole comment must be the directive. Matching it anywhere in the text meant
// prose that merely mentions the syntax silenced a rule, which this file's own
// paragraph above did.
const DIRECTIVE = /^comment-lint-allow:\s*(.+?)\s*$/i;

export function isDirective(body) {
  return DIRECTIVE.test(body.trim());
}

// A directive that names nothing real, or that suppresses nothing, is dead
// configuration: it reads as a silenced rule while silencing nothing, and it
// blinds the line for whoever inherits it. Reported for the same reason ESLint
// has --report-unused-disable-directives and ruff has RUF100.
class Allowance {
  constructor(directives) {
    this.entries = [];
    for (const directive of directives) {
      for (const token of directiveTokens(directive.body)) {
        this.entries.push({ token, directive, known: token in RULES, used: false });
      }
    }
  }

  // Called only once a rule has decided it would report, so a directive counts
  // as used when it actually silenced something. Asking before the rule decided
  // marked every consulted directive as used, which hid the unused ones.
  suppresses(rule) {
    let allowed = false;
    for (const entry of this.entries) {
      if (entry.token !== rule) continue;
      entry.used = true;
      allowed = true;
    }
    return allowed;
  }

  reportUnused(report) {
    for (const entry of this.entries) {
      if (entry.used) continue;
      const detail = entry.known ? `${entry.token} is allowed here but nothing reported it` : `${entry.token} is not a rule`;
      report("CMT010", entry.directive.line, entry.directive.column, detail, entry.directive.body);
    }
  }
}

// Every token a directive names, valid or not, so an unknown one is reported
// rather than quietly ignored. Matching only real ids would let `CMT999` through
// as a silent no-op: it looks like a rule and silences nothing.
export function directiveTokens(body) {
  const match = DIRECTIVE.exec(body.trim());
  if (!match) return [];
  return match[1]
    .split(",")
    .map((token) => token.trim().toUpperCase())
    .filter(Boolean);
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
    // A directive is scaffolding, not content. Leaving it in the run made it two
    // lines long, and CMT001 only judges a one-line run, so any directive
    // silenced CMT001 whatever rule it named.
    const directives = run.lines.filter((l) => isDirective(l.body));
    const content = run.lines.filter((l) => !isDirective(l.body));
    const allowed = new Allowance(directives);

    if (content.length === 0) {
      allowed.reportUnused(report);
      continue;
    }

    const bodies = content.map((l) => l.body);
    const runText = bodies.join("\n");
    const first = content[0];

    // Only CMT004 and CMT009 judge a trailing comment. The others depend on the
    // comment introducing the code below it, and a trailing comment sits beside
    // it: `0x25 // "%PDF"` overlaps in words while adding the decoding, which is
    // the kind of lower-altitude fact the standard asks for.
    if (run.trailing) {
      for (const entry of content) {
        const body = entry.body.trim();
        if (body.length === 0) continue;
        if (isDiffNarration(body) && !allowed.suppresses("CMT004")) {
          report("CMT004", entry.line, entry.column, truncate(body), body);
          continue;
        }
        if (isUnownedTodo(body, runText) && !allowed.suppresses("CMT009")) {
          report("CMT009", entry.line, entry.column, truncate(body), body);
        }
      }
      allowed.reportUnused(report);
      continue;
    }

    if (isDeadCodeRun(bodies) && !allowed.suppresses("CMT005")) {
      report("CMT005", run.startLine, first.column, `${bodies.length} commented-out lines`, runText);
      allowed.reportUnused(report);
      continue; // Every other rule would pile onto the same block of dead code.
    }

    // A doc block is exempt: the standard asks for thorough contracts, so capping
    // their length would argue with itself. This judges runs of implementation
    // comment, where an essay means the code needs restructuring.
    const essay = run.kind !== "doc" && content.length > MAX_BLOCK_LINES && run.startLine > FILE_HEADER_LINES;
    if (essay && !allowed.suppresses("CMT006")) {
      report("CMT006", run.startLine, first.column, `${content.length} lines, limit ${MAX_BLOCK_LINES}`, runText);
    }

    const owner = run.kind === "line" ? "" : nextCodeLine(lines, run);

    for (const entry of content) {
      const body = entry.body.trim();
      if (body.length === 0) continue;

      if (isBanner(body) && !allowed.suppresses("CMT002")) {
        report("CMT002", entry.line, entry.column, truncate(body), body);
        continue;
      }
      if (isStepNarration(body) && !allowed.suppresses("CMT003")) {
        report("CMT003", entry.line, entry.column, truncate(body), body);
        continue;
      }
      if (isDiffNarration(body) && !allowed.suppresses("CMT004")) {
        report("CMT004", entry.line, entry.column, truncate(body), body);
        continue;
      }
      if (docRestatesSignature(body, owner) && !allowed.suppresses("CMT007")) {
        report("CMT007", entry.line, entry.column, truncate(body), body);
        continue;
      }
      if (isUnownedTodo(body, runText) && !allowed.suppresses("CMT009")) {
        report("CMT009", entry.line, entry.column, truncate(body), body);
        continue;
      }
    }

    // CMT001 judges a whole single-line run against the code it introduces, so
    // a two-line comment that happens to echo one identifier is left alone.
    // A one-line `/* … */` counts, which is how JSX `{/* Cap editor */}` above
    // `<CapEditor …>` is caught. A doc block does not: it is a contract, and
    // CMT007 is the rule that judges those.
    if (run.kind !== "doc" && content.length === 1) {
      const entry = first;
      const body = entry.body.trim();
      const code = nextCodeLine(lines, run);
      if (code && !isBanner(body) && restatesCode(body, code) && !allowed.suppresses("CMT001")) {
        report("CMT001", entry.line, entry.column, `${truncate(body)}  ->  ${truncate(code)}`, body);
      }
    }

    allowed.reportUnused(report);
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
