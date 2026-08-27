# Code comments

A comment must carry information the code cannot. If a reader could derive it from
the code in front of them, delete it: a redundant comment still has to be
maintained, will eventually contradict the code, and dilutes the comments that
matter.

The operative rules are in `AGENTS.md`, kept short so they stay in an agent's
context. This document is the reasoning and the worked examples behind them, plus
how to run the linter.

## Comment the current state

Describe the code as it is. Not what it used to be, not what changed, not why it
changed. A comment that narrates history is stale the moment the next change
lands, and git already holds that record.

When you know the history and it explains the shape of the code, the useful half is
the reason, not the sequence. State the reason:

```java
// Don't:
// This used to reimplement the modal internals, which is how the procurement
// dialogs drifted from the billing ones.

// Do:
// Thin wrapper over the shared Modal: duplicating its portal and focus trap is
// how dialogs drift apart.
```

Future state is the exception, and it belongs in a TODO with an issue.

## The four jobs

**Contract.** What a caller must know that the signature cannot say:
preconditions, invariants, units, ownership and lifetime, thread-safety, error
semantics, side effects.

The bound is the surface, not the volume: document the contract of everything a
caller outside the file can reach, and nothing else. Inside that surface say
whatever a caller needs; outside it a comment earns its place on the same terms as
any other.

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

**Why.** The constraint the code satisfies, the bug it avoids, the alternative
rejected and the reason.

```java
// whenComplete runs on the worker thread after the run finishes, so the
// terminal event never races the step events.
handle.completion()
```

A reference is supplementary, never load-bearing: the comment must survive
deleting it. `// See #1234` is a dead end.

```java
// flatten() reads the annotation list that save() clears, so saving first loses
// every annotation (#6865).
document.flatten(annotations);
```

Prefer a spec (`RFC 3161`, `ISO 4217`) or a CVE where one applies. Both are
immutable; a ticket can be closed, moved or made private.

**Hazard.** "Must stay in sync with X." "Order matters because Y." "Do not remove,
it prevents Z."

**Map.** A short orientation at the head of a genuinely complex file: what it owns,
and what it deliberately does not.

## The test that decides it

A comment earns its place when it sits at a different level of detail than the line
below it: lower, stating a precise fact the code implies but does not say, or
higher, giving intent a reader would otherwise assemble from ten lines.
Same-altitude is the definition of redundant.

- **Delete it.** Is any information lost? If not, it stays deleted.
- **Could a name carry it instead?** A better identifier, an extracted function or
  a named constant beats a comment. Prefer the code change.

## What not to write

| Don't | Instead |
| --- | --- |
| `// Handle drag start` above `handleDragStart` | Nothing. The name already says it. |
| `// ─── Types ───`, `// Helpers`, `// ====` | If a file needs internal signposting, split the file. |
| `// Step 1:` narrating a function body | Extract functions. If the steps need labels they need names. |
| `// No longer needed`, `// Previously this used X` | State why the code is as it is now, or nothing. |
| Commented-out code | Delete it. Git remembers. |
| `@param blob - The blob to download` | Omit the tag rather than pad it. |
| Docs on a self-explanatory member | Nothing, unless there is a real constraint to state. |

Step numbering is fine where it labels a genuinely numbered thing, such as a wizard
step or a step in a written test procedure. It is narration when it numbers the
lines of one function.

## Comments at the end of a line

A trailing comment usually does a different job from one above the code: it decodes
the line it sits on. Those are worth keeping, and the linter leaves them alone.

```java
byte[] pdfBytes = {0x25, 0x50, 0x44, 0x46};   // "%PDF"
long maxAttachmentSize = 50L * 1024 * 1024;   // 50 MB
double buffer = 0.10;                         // 10% headroom
default -> toBytes(value, 2);                 // MB
```

Each overlaps in words with the code and each adds the interpretation the code
leaves implicit, which is the lower-altitude case the test above asks for. So
`CMT001` does not judge trailing comments; on this codebase it would have been
wrong about roughly six in seven of them.

What still applies is anything that does not depend on the code below: a trailing
`// TODO fix this` is as unowned as one on its own line, and a trailing
`// this used to run before the flush` narrates history wherever it sits.

A comment block over about 12 lines, outside a file or type header, is usually a
sign the code needs restructuring. If it is genuinely product documentation, it
belongs in the docs repo.

## TODOs

A TODO needs an issue, because an issue is the only part that will close it:

```java
// TODO(#1234): re-enable the checkout gate once account syncing lands
```

An owner is not a substitute: a username goes stale when someone changes team and
means nothing to an outside contributor. If the work is not worth an issue it is
not worth a TODO, and the options are to do it now or leave the code alone. A
question is not a TODO.

## Per language

**Java.** Google Java Style, which this repo already formats to. Its &sect;7.3.1
exception applies: omit Javadoc on a self-explanatory member where there is
genuinely nothing to add, but do not cite it to skip something a reader needs.
Summary fragments are noun or verb phrases, not sentences starting "This method
returns".

**TypeScript.** JSDoc on the `@app/*` seams, exported hooks, and anything crossing
a layer boundary. No `@param`/`@returns` that restates a typed signature. JSX
comments follow the same rules as any other.

**Python.** Docstrings on modules, public functions and Pydantic models where the
contract is not obvious from the type.

## The linter

```bash
task comment-lint          # what the working tree adds over HEAD
task comment-lint:branch   # what the branch adds over origin/main (BASE=<ref> to change)
task pre-commit:comment-lint:ci    # the fixture corpus, then the diff
```

`comment-lint` is the pre-commit question, so it reports nothing once you have
committed; on a CI pull request it compares against the target branch via
`GITHUB_BASE_REF`. `comment-lint:branch` is the review question. The corpus checks
the rules themselves rather than the code under review, so it runs on CI and before
a rule change, not on every local commit.

`task comment-lint` also runs inside `task pre-commit`, and as a Claude Code `Stop`
hook, so an agent is told before it finishes a turn and fixes the comment inside
that turn. Stop rather than per file write: a run costs the same for one file as for
twenty-five, and half of all writes in a turn go to a file already written in it.

Findings are scoped to comment text that is new, not to lines git calls new, so
reindenting or moving code does not resurface comments you did not write.

The rules are the `RULES` object in
[`scripts/lint/comment-rules.mjs`](../scripts/lint/comment-rules.mjs); the exact
condition for each is the predicate of the same name in that file, with the
readings it deliberately excludes beside it.

**Every rule blocks.** A rule that only warns is a rule nobody acts on. So a
finding you believe is wrong is a bug in the rule, not something to live with:
narrow the rule, or mark the line and say why.

Every comment form the repo writes is covered: `//` and `/* */`, Javadoc and JSDoc,
JSX comments, `#`, and Python docstrings. `CMT007` reads all three parameter
conventions in use here, Javadoc/JSDoc `@param`, Sphinx `:param name:` and Google
`name: description` under `Args:`.

Two engines, one rule set. `.ts`/`.tsx`/`.mjs` go to an oxlint JS plugin, so
comments come from the parser: a `//` inside a string is not a comment, and JSX
`{/* … */}` is. `.java`/`.py` go to a line scanner. Neither reads the other's
files, so they cannot disagree about one file. `scripts/lint/fixtures/` is the
corpus that keeps them meaning the same thing.

### When a finding is wrong

Name the rule on the line above:

```ts
// comment-lint-allow: CMT002
// ─── kept deliberately, because <reason> ───
```

There is no form that disables every rule, and the directive has to earn its
place. `CMT010` reports one that names something which is not a rule, and one that
silences nothing, so a typo does not read as a suppression and a stale
suppression does not sit there blinding the line. The whole comment must be the
directive; prose that mentions the syntax is just prose.

If you reach for this more than occasionally the rule is wrong: fix it in
`comment-rules.mjs` and update the fixture corpus in the same commit, so the diff
shows what moved.

### The existing backlog

`task pre-commit:comment-lint:all` reports the whole tree and never fails. There is
a standing backlog being cleared by directory; diff scoping is what keeps it off
whoever touches a file first.

To turn the editor hook off, put `{ "env": { "COMMENT_LINT_HOOK": "0" } }` in
`.claude/settings.local.json`. The commit-time gate still applies, so you lose the
early warning rather than the check.
