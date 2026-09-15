---
name: comment-review
description: >-
  Review and improve the code comments a PR or branch adds, against the standard in
  devGuide/CODE_COMMENTS.md: cut the ones that restate the code, tighten the verbose
  ones, reframe what-comments into the why or the constraint, and add the contract
  docs the change left missing. Runs comment-lint for the mechanical rules first,
  then judges what a linter cannot: padding around one real fact, facts already
  stated by a type or a name, comments that will go stale on the next unrelated
  change, and new public surfaces left undocumented. Applies comment-only edits and
  reports every verdict in chat. Use when asked to review, clean up, trim, thin out
  or improve the comments on a PR or branch, to strip AI-looking narration before
  requesting review, or when comment-lint findings need judgment rather than a
  mechanical fix. Pass --report-only to change nothing.
argument-hint: "[pr-number|branch|base-ref] [--report-only]"
allowed-tools: Bash, Read, Grep, Glob, Edit
---

# Comment review

Make the comments this branch adds fewer and worth more. Every comment kept is a line
someone has to maintain and eventually reconcile with the code, so it has to pay for
itself. A pass that only deletes is half the job: the same read should find the
contract, hazard and unit the change introduced and left unsaid.

`$ARGUMENTS` may name a PR number, a branch, or a base ref; default is this branch
against where it forked from the main line. `--report-only` reports without editing.

## The standard

`AGENTS.md` section "Comments" is the short form; `devGuide/CODE_COMMENTS.md` is the
authority, with the reasoning and the worked examples. **Read
`devGuide/CODE_COMMENTS.md` before judging anything.** Do not work from memory of what
a good comment is: the repo has already decided, and the four jobs (contract, why,
hazard, map) are the whole permitted set.

## Hard rules

1. **Comment-only diff.** Never rename, extract, reorder or restructure code in this
   pass. Where the right fix is a code change, report it as a suggestion.
2. **Scope is what the branch adds or edits.** Comments the branch never touched are
   the standing backlog (`task pre-commit:comment-lint:all`), not this review.
3. **Never delete information you cannot re-derive from the code in front of you.** If
   verifying the comment sent you into another file, a spec, or the git log, it is
   carrying information. Keep it; tighten at most.
4. **Never invent a rationale.** If the why is not determinable from the code, cut the
   comment or flag it for the author. A fabricated why gets trusted, which is worse
   than silence.
5. **No suppressions.** Do not add `comment-lint-allow` to make a finding go away. If a
   rule is genuinely wrong, say which and why in the report.
6. **Report in chat.** Never post to the PR, never reply to threads, never resolve
   anything, unless the user asks in this session.
7. **No ratio targets.** Volume is not the metric. A dense header on a genuinely
   complex file can be exactly right, and the repo's highest comment-ratio commits are
   its best-documented work. Judge one comment at a time.

## Process

### 1. Scope the change

Read the PR's own base branch rather than assuming main, because a stacked PR whose
base is another PR would otherwise be reviewed together with its parent:

```bash
gh pr view <n> --json baseRefName,headRefName,title
```

Then get the head onto disk. `gh pr checkout <n>` normally, but it fails when
another worktree already holds that branch, and a review needs no branch of its own:

```bash
git fetch -f origin <headRefName>:refs/review/pr<n>-head <baseRefName>:refs/review/pr<n>-base
git checkout --detach refs/review/pr<n>-head
BASE=$(git merge-base HEAD refs/review/pr<n>-base)
```

A stale remote ref can fail the fetch entirely ("incorrect old value provided"). Fetch
the two branches by name as above rather than fetching everything, and confirm the
head commit is the PR's before reading anything.

With no PR number, review this branch against where it forked from the main line:
`BASE=$(git merge-base HEAD origin/main)`.

### 2. Mechanical pass

```bash
node scripts/lint/comment-lint.mjs --since "$BASE"
```

If it warns that oxlint is missing, run `task frontend:install` first or the TS and TSX
half is silently unchecked. Each finding names a rule in
`scripts/lint/comment-rules.mjs`; the fix is the rewrite the rule implies. The rules
are deliberately narrow, they do not judge trailing comments at all, and each one
excludes readings that had an innocent form. So a clean run says nothing about
verbosity: it is the floor, not the review.

### 3. Inventory every comment the branch adds

```bash
node .claude/skills/comment-review/added-comments.mjs "$BASE"
```

This is the checklist, and it over-reports slightly by design. Every entry on it gets
a verdict. Do not rewrite it as an inline awk or perl one-liner: `$0` and `$1` in the
script body are rewritten by argument interpolation before the shell sees them, which
silently produces an empty inventory and a review that judged nothing.

Also read what the branch **removed**:

```bash
git diff "$BASE"...HEAD | grep -E "^-\s*(//|/\*|\*|#)" | head -40
```

A rewritten comment shows up as one line added and one removed, and the removed half
is where a fact goes missing. A branch that has already had a tightening pass is the
likeliest place to find one.

### 4. Read the code, not the diff

Open each file at the comment. A diff hunk is not enough to judge one: you need the
code it introduces, the signature it claims to document, and whether the fact it states
is already carried by a type, a name, a constant, an enum's own cases, or a doc block
two lines up. Two copies of one fact drift apart, which is the maintenance cost with
none of the value.

### 5. Judge

Five tests, cheapest first:

- **Delete it.** Is any information lost? If not, it stays deleted.
- **Altitude.** Does it sit at a different level of detail than the code below, either
  lower (a precise fact the code implies but does not say) or higher (intent a reader
  would otherwise assemble from ten lines)? Same altitude is the definition of
  redundant.
- **Name.** Could a better identifier, an extracted function or a named constant carry
  it instead? Then the comment is the wrong fix.
- **Staleness.** Will this need editing the next time the code changes for an unrelated
  reason? A comment that tracks the code rather than constrains it will drift and then
  mislead.
- **Duplication.** Is this fact stated somewhere else already? Delete the copy.

Give every inventoried comment exactly one verdict:

- **Cut.** Restates the code, banners a section, narrates steps or history, is
  commented-out code, duplicates a fact, or pads one real fact with three sentences
  that only set each other up.
- **Tighten.** The fact is real and the prose is long. Keep the fact, drop the words.
  One fact per comment; no sentence whose only job is to introduce the next one.
- **Reframe.** It says what the code does. State the why, the hazard or the contract
  instead, subject to rule 4.
- **Add.** The change introduced something a caller outside the file can reach, or an
  invariant, unit, ordering requirement, lifetime, thread-safety or error semantic, and
  left it undocumented. Also the map comment a genuinely complex new file needs.
- **Keep.** Earns its place. Count these; do not list them one by one.

**Do not cut:**

- Hazards: "must stay in sync with X", "order matters because Y", "do not remove, it
  prevents Z".
- Units, ranges, encodings, magic-byte decodes, currency and timezone assumptions.
  These are mostly trailing comments, which the linter leaves alone because on this
  codebase most of them are right.
- The alternative that was rejected, and the reason.
- Spec, RFC and CVE references, and TODOs that carry an issue.
- Security and failure semantics: fail-closed ordering, what is deliberately not
  defended, ownership and lifetime.
- Anything whose truth you had to leave the file to verify.

### 6. Apply

Skip this step entirely under `--report-only`.

Edit comments only. Match the file's convention: Javadoc summary fragments rather than
"This method returns", JSDoc on the `@app/*` seams and layer boundaries with no
`@param` restating a typed signature, Python docstrings where the type does not carry
the contract. Plain ASCII prose, no em dashes, no repeated bold lead-ins.

Then run the formatter for each language touched, because rewrapping a doc block
changes line wrapping and the format gate will fail otherwise:

- Java: `task backend:format`
- TS and TSX: `task frontend:format`
- Python: `task engine:fix`

Re-run `node scripts/lint/comment-lint.mjs --since "$BASE"` and confirm it is clean. Do
not commit unless asked. The diff is comment-only, so `git diff` is the entire review
surface.

### 7. Report

Terse, in chat:

- One counts line: `N in scope: X cut, Y tightened, Z reframed, A added, K kept`.
- Per file, one line per changed comment: a clickable `path:line`, the verdict, and the
  reason in a few words. No before/after quoting unless it is genuinely unclear.
- **Needs your call**, listing what you deliberately did not do: comments whose truth
  you could not verify, rationale you would have had to invent, and the code changes a
  comment was papering over (extract this, rename that, split the file).
- Any linter finding you believe is wrong, naming the rule.

## Principles

- Fewer comments, more information in each.
- The reader is a new contributor with this file open, not someone who read the PR.
- Deleting a good comment costs more than keeping a mediocre one. Uncertainty means
  keep it and flag it.
- The additions matter as much as the cuts. A branch that leaves a new public surface
  undocumented is not improved by trimming its narration.
