# Code comments

A comment must carry information the code cannot. If a reader could derive it from
the code in front of them, it is not neutral: it has to be maintained, it will
eventually contradict the code, and it dilutes the comments that matter.

That single rule is the whole standard. The rest of this document is how to apply
it, and what the linter checks.

This is not a campaign to have fewer comments. Every rule the linter enforces is a
deletion, because deletion is the half a pattern can judge; the half that matters
more is the writing, and no linter will ask you for it. The contract docs below are
the part this codebase is short of.

## The four jobs a comment can do

**Contract.** What a caller must know that the signature cannot say:
preconditions, invariants, units, ownership and lifetime, thread-safety, error
semantics, side effects. Goes on the type, method, or module as Javadoc, JSDoc, or
a docstring.

This is the one category the codebase is short of rather than long on, but "be
generous" is not a checkable instruction, and taken alone it produces the padding
`CMT007` flags. The bound is the surface, not the volume: **document the contract
of everything a caller outside the file can reach, and nothing else.** Concretely,
visible types and members in Java, the `@app/*` seams and exported hooks in
TypeScript, modules and public functions in Python. Inside that surface, say
whatever a caller genuinely needs. Outside it, a comment has to earn its place on
the same terms as any other.

```java
/**
 * Authority on which filesystem locations a policy may read or write. Fail-closed
 * in order: denied entirely under the saas profile; Stirling's own config dir is
 * always rejected; the path must resolve within policies.allowedFolderRoots.
 *
 * <p>Compared after normalisation so {@code ..} cannot escape a root. Symlink
 * escape is not defended: an operator who roots an allowlist on a symlink to a
 * sensitive location is trusted.
 */
```

Nothing there is recoverable from reading the method bodies. It states the
ordering, the failure mode, and a deliberate gap in the threat model.

**Why.** The non-obvious reason the code is shaped this way: the constraint it
satisfies, the bug it avoids, the alternative that was rejected.

Point at a source when there is one, and know how long each kind lasts. A **spec**
is the best reference available and never moves: `RFC 3161`, `ISO 4217`, `RFC 9728
section 3.1`. A **CVE or GHSA** is immutable too. A **ticket** is the weakest of
the three, because it can be closed, moved or made private, so it must not be the
only thing holding the comment up.

That is the rule for all three, not just tickets: **a reference is supplementary,
never load-bearing.** The comment has to survive deleting it. `// See #1234` is a
dead end; the same fact with the reason first is not:

```java
// flatten() reads the annotation list that save() clears, so saving first loses
// every annotation (#6865).
document.flatten(annotations);
```

Delete the `(#6865)` and the comment still tells you everything you need. That is
the test.

```java
// whenComplete runs on the worker thread after the run finishes, so the
// terminal event never races the step events.
handle.completion()
```

**Hazard.** "Must stay in sync with X." "Order matters because Y." "Do not
remove, it prevents Z." These pay for themselves the first time someone reads
them.

**Map.** A short orientation at the head of a genuinely complex file: what it
owns, and what it deliberately does not.

## The test that decides it

A comment earns its place when it sits at a **different level of detail** than the
line below it. Either lower, stating a precise fact the code implies but does not
say, or higher, giving the intent a reader would otherwise assemble from ten
lines. Same-altitude is the definition of redundant.

Two checks before keeping a comment:

- **Delete it.** Is any information lost? If not, it stays deleted.
- **Could a name carry it instead?** A better identifier, an extracted function,
  or a named constant beats a comment every time. Prefer the code change.

## What not to write

| Don't | Instead |
| --- | --- |
| `// Handle drag start` above `handleDragStart` | Nothing. The name already says it. |
| `// ─── Types ───`, `// Helpers`, `// ====` | If a file needs internal signposting, split the file. |
| `// Step 1:` narrating a function body | Extract functions. If the steps need labels, they need names. |
| `// No longer needed`, `// Previously this used X` | The commit message. Code has git history; comments do not need one. |
| Commented-out code | Delete it. Git remembers. |
| `@param blob - The blob to download` | Omit the tag rather than pad it. |
| Docs on a self-explanatory member | Nothing, unless there is a real constraint to state. |

Two of these have a legitimate form worth knowing:

- **Step labels** are fine when they label a real numbered thing, such as a wizard
  step in `AddWatermark.tsx` or a step in a written manual test procedure. They are
  narration when they number the lines of one function.
- **History** is fine as rationale. "This used to reimplement all of it, which is
  precisely how the procurement dialogs drifted from the billing ones" explains why
  the wrapper is thin. The same fact as a bare changelog entry explains nothing.

A block longer than about 12 lines outside a file or type header is usually prose
that belongs in `devGuide/`, or a sign the code needs restructuring.

## TODOs

A TODO needs something that will eventually close it, which means an issue:

```java
// TODO(#1234): re-enable the checkout gate once account syncing lands
```

An owner is not a substitute. A username goes stale the moment someone changes
team and means nothing to an outside contributor, while an issue outlives both. If
the work is not worth an issue, it is not worth a TODO, and the honest options are
to do it now or leave the code as it is.

This is the one comment category demonstrably rotting here today: of 25 TODO,
FIXME and HACK comments in the tree, 21 name neither an issue nor an owner. Some
are questions rather than tasks (`// TODO: why do this server side not client?`),
which is a note to nobody. `CMT009` advises on new ones, at the point where
opening the issue is cheapest.

## Per-language notes

**Java.** Per the Google Java Style guide this repo already formats to. Its
&sect;7.3.1 exception applies: omit Javadoc on a self-explanatory member where there
is genuinely nothing to add, but do not cite that to skip something a reader needs.
Summary fragments are noun or verb phrases, not sentences beginning "This method
returns".

**TypeScript.** JSDoc where a caller needs the contract, particularly on the
`@app/*` seams, exported hooks, and anything crossing a layer boundary. Do not
add `@param`/`@returns` tags that restate a typed signature; the types already say
it. JSX comments follow the same rules as any other, including the one about not
restating the component below them.

**Python (engine).** Docstrings on modules, public functions, and Pydantic models
where the contract is not obvious from the type. `AGENTS.md` already says to add
comments sparingly and only for non-obvious intent; this document is that rule
spelled out.

## The linter

Two tasks, differing only in what counts as "new":

```bash
task comment-lint          # what the working tree adds over HEAD
task comment-lint:branch   # what the branch adds over origin/main (BASE=<ref> to change)
```

The first is the pre-commit question, so it reports nothing once you have
committed. The second is the review question. On a CI pull request the plain task
compares against the target branch automatically, via `GITHUB_BASE_REF`.

Both run the fixture corpus first, silently. `task pre-commit:comment-lint:selftest`
runs it verbosely when you want to see it.

`task comment-lint` also runs inside `task pre-commit`, so the git hook and CI both
get it, and the same rules run as a Claude Code `PostToolUse` hook so an agent sees
findings on the file it just wrote.

The hook is configured in the committed `.claude/settings.json`. Personal Claude
config belongs in `.claude/settings.local.json`, which stays git-ignored, and hook
entries from the two merge rather than replacing each other, so your own hooks keep
running. To turn this one off, put `{ "env": { "COMMENT_LINT_HOOK": "0" } }` in your
local settings; the commit-time gate still applies, so you lose the early warning
rather than the check.

If you already had a hand-written `.claude/settings.json` before this landed, save a
copy first. That path used to be git-ignored, and git overwrites an ignored file
without warning when a commit starts tracking it.

Two engines, one rule set (`scripts/lint/comment-rules.mjs`):

- **`.ts` / `.tsx`** go to an oxlint JS plugin, so comments come from the parser.
  A `//` inside a string is not a comment, JSX `{/* … */}` is, and positions are
  exact.
- **`.java` / `.py`** go to a line scanner in `scripts/lint/comment-lint.mjs`.

Neither engine ever scans the other's files, so they cannot disagree about one
file. `scripts/lint/fixtures/` is the corpus that keeps them meaning the same
thing; `task pre-commit:comment-lint:selftest` checks it.

| Rule | Fires on | |
| --- | --- | --- |
| `CMT001` | A comment whose words are all already in the code below it | blocks |
| `CMT002` | Section banners and position markers | blocks |
| `CMT005` | Three or more consecutive commented-out lines of code | blocks |
| `CMT003` | `Step N:` and `Then,` narration | advises |
| `CMT004` | Comments about the change rather than the code | advises |
| `CMT006` | A comment block over 12 lines outside a header | advises |
| `CMT007` | Doc tags that restate the signature | advises |
| `CMT008` | `IMPORTANT:` / `CRITICAL:` with nothing to point at | advises |
| `CMT009` | A `TODO` / `FIXME` / `HACK` naming no issue or link | advises |

Only three rules block, and which three was decided by running them over this
repo. The others each have a legitimate form that no pattern can distinguish from
the bad one, and blocking those would teach people to delete good comments to get a
build green.

`CMT005` catches runs of three or more, so a single commented-out line passes. That
is a deliberate trade against false positives on prose, and it means its low count
is not evidence that the tree is free of dead code.

Findings are scoped to comment *text* that is new, not just to lines git calls new.
Reindenting or moving code does not resurface comments you did not write.

Advisory findings print and never fail anything. Fix them when they are right.

### When a finding is wrong

Put the escape hatch on the line above, naming the rule:

```ts
// comment-lint-allow: CMT002
// ─── kept deliberately, because <reason> ───
```

There is no form that disables every rule. If you reach for this more than
occasionally, the rule is wrong and worth fixing in `comment-rules.mjs` instead;
change the fixture corpus in the same commit so the diff shows what moved.

### The existing backlog

`task pre-commit:comment-lint:all` reports the whole tree and never fails. There
is a standing backlog of about 1,300 blocking findings, being cleared in chunks by
directory. Diff scoping is what keeps it from landing on whoever touches a file
first.
