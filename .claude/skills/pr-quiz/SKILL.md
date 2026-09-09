---
name: pr-quiz
description: >-
  Quiz the PR author on their own branch before they request review, to prove they
  actually understand the change - especially code an AI wrote for them. Scopes the
  branch diff vs its base, reads the changed code, then asks graded questions about
  what changed, why, how it works, what it could break, and which edge cases it must
  handle. Presents all questions first, waits for the author's answers, then grades
  each honestly against the real code (Correct / Partial / Incorrect with the true
  answer and file:line), scores it, and gives a readiness verdict that names the
  areas to re-study before asking humans to review. Use when asked to quiz me on my
  PR/branch, "test my understanding before review", a self-check gate before opening
  a PR, or before requesting reviewers. Administered as an interactive
  multiple-choice quiz (clickable options) by default; pass --free-text for
  written answers, --questions N to set count, --save to write a scorecard.
argument-hint: "[branch-or-base-ref] [--questions N] [--free-text] [--save]"
allowed-tools: Bash, Read, Grep, Glob, Write, AskUserQuestion
---

# PR Quiz

Test whether the **author** genuinely understands their own branch before they ask
other people to spend time reviewing it. This is a self-check gate: the point is to
catch changes - often AI-written - that the author would not be able to explain or
defend in review. Be a fair but honest examiner, not a pushover.

`$ARGUMENTS` may name a base ref or branch to diff against; default is this branch
vs where it forked from the main line. Flags:
- `--questions N` - target N questions (else scale to diff size, see below).
- `--free-text` - administer as a written numbered list instead of the default
  interactive multiple-choice.
- `--save` - also write a scorecard file after grading.

## Integrity rules (read first - the whole skill depends on these)

1. **Present every question before revealing any answer.** Ask, then wait. Never
   show the answer key alongside the questions.
2. **Do not give hints or the answer while the quiz is open.** If the author asks
   "what's the answer?" or "is it X?" before committing, decline warmly and tell
   them to give their best answer first - guessing is part of the signal.
3. **Grade truthfully.** Vague, hand-wavy, or "the AI did it" non-answers are
   Partial or Incorrect, not Correct. Do not inflate the score to be nice; a false
   pass defeats the entire purpose.
4. **Ground everything in code you actually read.** Every question and every model
   answer must trace to a real line in the diff. Cite `path:line`. No trivia
   ("how many lines?"), no invented behavior.
5. **Credit real understanding.** If the author explains it correctly in their own
   words, mark it Correct even if worded differently than your key.

## Process

### 1. Scope the change (silently)
- Find the base. Prefer the fork point off the main line so the quiz covers only
  this branch's work:
  ```bash
  git fetch -q origin 2>/dev/null; \
  BASE=$(git merge-base HEAD origin/main 2>/dev/null || git merge-base HEAD main); \
  git diff --stat "$BASE"...HEAD
  ```
  If `$ARGUMENTS` names a ref, diff against that instead.
- If the diff is empty, stop and say there's nothing to quiz on.
- Read commit messages / PR description for the *stated* intent, but verify it
  against the actual diff - a mismatch is itself a good question.

### 2. Understand the code well enough to examine on it
Read the full diff plus enough surrounding context and related files to answer
every question you plan to ask. You cannot grade understanding you don't have.
Note the non-obvious parts: the design decisions, the risky lines, the edge cases,
the cross-file ripples, and anything that violates or upholds repo conventions
(for this repo e.g. `@app/*` import layering, all file ops via FileContext,
Jackson 3 / Spring Boot 4 APIs, engine typed-contract boundaries).

### 3. Build the question set
Scale count to the change unless `--questions N` is given:
small (< ~50 changed lines) 3-4, medium 5-8, large 9-12. Cap at 12.
Draw from these categories - weight toward the ones the diff actually exercises:
- **Intent** - what problem this solves; why it was needed now.
- **Mechanism** - how a specific non-trivial piece actually works ("walk me
  through what `foo()` does when called with X").
- **Decisions & alternatives** - why this approach over an obvious alternative;
  what a reviewer would reasonably push back on.
- **Blast radius** - what else this touches or could break; what you'd retest.
- **Edge cases** - inputs/states the change must handle (null, empty, large,
  concurrent, error paths).
- **Conventions & correctness** - does it follow the repo's rules; is there a
  latent bug the author should be able to spot.
Prefer questions the author can only answer if they read and understood the code.
Keep a private answer key with `path:line` for each - do **not** show it yet.

### 4. Administer the quiz
- **Default (multiple choice):** use the `AskUserQuestion` tool. Per question write
  3-4 options where **every** option is independently plausible - each distractor a
  real-but-wrong reading of the code, not filler. Two hard rules so the answer
  can't be spotted by shape rather than knowledge:
  - **Randomise the correct option's position** across questions - never default
    it to first. Spread it roughly evenly over the slots.
  - **Keep all options the same depth and length.** Do not describe the correct
    one more fully than the distractors - a longer or more-detailed option is a
    dead giveaway. Trim the right answer or flesh out the wrong ones until a
    reader can't tell them apart by size.
  The tool caps a call at 4 questions, so ask in batches of 4 - but run them as
  one continuous flow: fire the next batch immediately after the previous
  returns, with no narration ("Round 2 of 3") and no grading between batches.
  The author always has an "Other" free-text escape, which is fine.
- **`--free-text`:** present all questions in one numbered list, then say
  "Answer in one reply; number your answers. I won't grade until you're done."
  Wait for the author's answers.
- Do not proceed to grading until every answer is in.

### 5. Grade
For each question, in order:
- Verdict: **Correct** / **Partial** / **Incorrect**.
- The model answer in one or two sentences, citing the real `path:line`.
- One line on the gap when Partial/Incorrect - what they missed and where to look.
Then a **Score** (e.g. 6/8, counting Partial as half) and a one-line summary of
the pattern (e.g. "solid on intent, shaky on the error paths").

### 6. Readiness verdict
End with a clear call:
- **Ready for review** - understanding is sound; note anything to mention to
  reviewers proactively.
- **Study first** - list the specific files/concepts to re-read before requesting
  review, each as a clickable `path:line`. Be concrete: "re-read the null handling
  in X before you send this out."
Keep it honest - if they'd get grilled in review on something, say so now.

### 7. If `--save`
Write `pr-quiz/<branch>-scorecard.md`: the questions, their answers, your grades
and model answers, the score, and the verdict. Don't commit it unless asked.

## Principles
- **The author is the examinee, not the collaborator.** During the quiz you withhold
  answers; you're measuring them, not helping them pass.
- **A failed quiz is a successful outcome** - it caught a gap before a human's time
  was spent. Frame it that way, not as a scolding.
- **True to the code.** Every question, answer, and grade traces to a line you read.
- **Terse and direct** in chat - the questions and the verdict, minimal preamble.
