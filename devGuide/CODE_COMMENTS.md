# Code comments

A comment must carry information the code cannot. If a reader could derive it from
the code in front of them, it is not neutral: it has to be maintained, it will
eventually contradict the code, and it dilutes the comments that matter.

That single rule is the whole standard. The rest of this document is how to apply
it, and what the linter checks.

## The four jobs a comment can do

**Contract.** What a caller must know that the signature cannot say:
preconditions, invariants, units, ownership and lifetime, thread-safety, error
semantics, side effects. Be generous here. This is the one category the codebase
is short of, not long on. Goes on the type, method, or module as Javadoc, JSDoc,
or a docstring.

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
satisfies, the bug it avoids, the alternative that was rejected. Name the ticket,
CVE, or spec when there is one.

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

## Per-language notes

**Java.** Javadoc on visible types and members, per the Google Java Style guide
this repo already formats to. Its &sect;7.3.1 exception applies: omit Javadoc on a
self-explanatory member where there is genuinely nothing to add, but do not cite
that to skip something a reader needs. Summary fragments are noun or verb phrases,
not sentences beginning "This method returns".

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

`task comment-lint` checks the lines your branch adds. It runs in `task
pre-commit`, so the git hook and CI both get it, and it also runs as a Claude Code
`PostToolUse` hook so an agent sees findings on the file it just wrote.

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
| `CMT005` | Three or more commented-out lines of code | blocks |
| `CMT003` | `Step N:` and `Then,` narration | advises |
| `CMT004` | Comments about the change rather than the code | advises |
| `CMT006` | A comment block over 12 lines outside a header | advises |
| `CMT007` | Doc tags that restate the signature | advises |
| `CMT008` | `IMPORTANT:` / `CRITICAL:` with nothing to point at | advises |

Only three rules block, and which three was decided by running all eight over
this repo. The other five each have a legitimate form that no pattern can
distinguish from the bad one, and blocking those would teach people to delete good
comments to get a build green.

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
