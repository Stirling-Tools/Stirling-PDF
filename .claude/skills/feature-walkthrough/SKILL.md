---
name: feature-walkthrough
description: >-
  Explain the full logic and process of the current branch end-to-end so someone
  with no prior knowledge of the task can understand, review, and reproduce it.
  Scopes the change from the branch diff, traces the flow across every layer it
  touches (frontend tool/hook/component, Java controller/service/endpoint, Python
  engine, config, i18n, tests), and produces a self-contained walkthrough document
  with Mermaid diagrams (sequence/flow/architecture), annotated file map with
  clickable references, before/after behavior, screenshots where a UI is involved,
  a "try it locally" section, and edge cases/risks. Use when asked for a feature or
  branch walkthrough, "explain what this branch does", a design/logic writeup, PR
  reviewer onboarding, or a hand-off doc. Pass --html to also emit a rendered HTML
  version; --no-screens to skip screenshots.
argument-hint: "[branch-or-area] [--html] [--no-screens]"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# Feature / Branch Walkthrough

Turn the current branch into a walkthrough a newcomer can follow. Audience:
**someone who has never seen this task**. Explain the *why*, the *flow*, and *how to
try it* - not just a diff summary.

`$ARGUMENTS` may name a branch or area to focus on; default is the current branch
vs `main`. Flags: `--html` (also emit a rendered HTML twin), `--no-screens`.

## Process

### 1. Scope the change
- `git log --oneline main..HEAD` and `git diff --stat main...HEAD` for the shape.
- Read the PR description / commit messages for stated intent. Do **not** invent
  history or motivation that isn't evidenced (state current behavior in present tense).
- Classify touched files by layer:
  - **Frontend**: tools (`frontend/editor/src/core/components/tools/*` or `.../core/tools/*`),
    hooks (`core/hooks/tools/*`, `useToolOperation`), contexts, routes, i18n
    (`public/locales/en-US`).
  - **Java backend**: controllers (`.../controller/api/...`), services, models, config.
  - **Engine**: `engine/src/stirling/{agents,contracts,api,services}`.
  - **Config / build / docker / tests.**

### 2. Trace the flow end-to-end
Follow one real path from user action to result. For a typical PDF tool that's:
UI control → `useToolOperation` hook → `POST /api/v1/...` → Spring controller →
service (PDFBox / LibreOffice / engine call) → response → review panel → download.
Read the actual files so the narrative is true to the code, and collect the exact
file:line anchors you'll cite.

### 3. Draw the diagrams (Mermaid)
Pick what fits; usually 2-3 of:
- **Sequence diagram** - request/response across frontend → backend → engine.
- **Flowchart** - the core decision/branching logic of the feature.
- **Architecture/component** - new pieces and how they wire to existing ones.
- **State** - if the feature has modes/steps.
Keep nodes labeled in plain language. Validate the Mermaid parses before shipping.

### 4. Screenshots (unless --no-screens)
If a UI is involved, capture key states with the stubbed Playwright harness
(see the **ui-walkthrough** skill and `files-page-screenshots.spec.ts` for the
pattern) or, for before/after, capture `main` then the branch. Drop PNGs in
`walkthrough/<feature>/` and reference them from the doc. For backend-only
changes, show request/response examples (curl + JSON) instead.

### 5. Write the walkthrough
Create `walkthrough/<feature>/FEATURE-WALKTHROUGH.md` with:
1. **TL;DR** - what the branch does and who it's for, in 3-4 sentences.
2. **Problem & approach** - what wasn't possible before; the chosen solution.
3. **Architecture diagram** + 1-paragraph orientation.
4. **End-to-end flow** - the sequence diagram + a numbered walk of each step,
   each citing the real file (clickable `path:line`).
5. **Key files** - annotated map (path → one line on its role).
6. **Logic deep-dive** - the flowchart + prose for the non-obvious decisions.
7. **Behavior** - before vs after; screenshots or request/response examples.
8. **Try it locally** - exact steps (`task dev` / `task dev:all`, the route to
   open or the curl to run, any env like `DOCKER_ENABLE_SECURITY` or a test
   license key). Make it copy-pasteable.
9. **Edge cases, risks, follow-ups** - what's untested, known limits, gotchas.

Markdown is the primary deliverable - it renders with diagrams in GitHub PRs and
IDEs, no build step, ideal for review.

### 6. If `--html`
Also emit `walkthrough/<feature>/walkthrough.html`: the same content with Mermaid
rendered via `mermaid.initialize({startOnLoad:true})` (script from CDN; note in
the file that rendering diagrams needs network, the `.md` is the offline copy) and
screenshots inline. Keep it self-contained otherwise.

### 7. Deliver
Give the doc path and a short chat summary. Offer to `SendUserFile` it.

## Principles
- **True to the code.** Every claim traces to a file you read; cite `path:line`.
  No fabricated migration/version history.
- **Newcomer-first.** Define repo-specific terms (FileContext, `useToolOperation`,
  the `@app/*` layer cascade, stubbed vs live tests) on first use.
- **Show, don't assert.** Prefer a diagram + a real example over adjectives.
- Don't commit the `walkthrough/` output unless asked.
