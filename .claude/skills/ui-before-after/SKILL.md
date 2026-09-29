---
name: ui-before-after
description: >-
  Analyse a branch or PR and automatically capture before/after screenshots of
  every UI surface its changes touch, then pixel-diff the pairs to surface what
  actually changed and assemble PR-ready before/after montage images. Generic and
  diff-driven: it derives the capture targets from the diff (changed tools/routes →
  URLs) instead of hand-listing screens, captures "before" from the base branch and
  "after" from the head, then keeps only the views that visually differ. Each
  comparison is auto-cropped to the region that actually changed (the bounding box of
  differing pixels), falling back to the full page only when the change spans most of
  it. Use for before/after shots, a visual diff of a branch/PR, "screenshots for the
  PR description", "show what changed in the UI", or a side-by-side of UI changes.
  Takes a PR number/URL (resolved via gh) or a branch; defaults to the current branch
  vs its base. Flags: --scope <selector>, --base <ref|merge-base>, --theme
  light|dark|both, --all (capture every route, not just changed), --no-autocrop,
  --pagewide <n>, --threshold <n>.
argument-hint: "[PR# | PR-url | branch] [--scope <sel>] [--base <ref>] [--theme both] [--all] [--no-autocrop]"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# UI Before / After (generic visual diff)

Point it at a branch or PR; it figures out which UI changed, screenshots every
affected surface **before** (base) and **after** (head), pixel-diffs the pairs, and
montages the ones that actually changed into images for the PR description.

`$ARGUMENTS`: a PR number/URL, a branch, or nothing (current branch vs base).
By default it captures the full viewport and auto-crops each comparison to the region
that changed. Flags: `--scope <css>` (narrow the *capture* to a container, e.g.
`[data-sidebar="tool-panel"]`, when you already know where the change is),
`--no-autocrop` (keep full frames), `--pagewide <fraction>` (above this share of the
page, skip cropping; default 0.6), `--base <ref|merge-base>`,
`--theme light|dark|both`, `--all` (walk every route, not just changed),
`--threshold <fraction>` (diff sensitivity, default 0.001).

Shares the capture harness with **ui-walkthrough** - read its SKILL.md for the
stubbed-Playwright setup, worktree node_modules + `generate-icons`, the
stale-`:5173` gotcha, and the dark-mode init-script. Bundled helpers:
[capture-spec.template.ts](capture-spec.template.ts), [diff-shots.mjs](diff-shots.mjs),
[montage-template.html](montage-template.html), [shoot-sections.mjs](shoot-sections.mjs).

## Process

### 1. Resolve target + base
```
gh pr view <pr> --json number,title,headRefName,baseRefName,url,files   # PR
# or branch: base = merge-base(main, HEAD); head = HEAD
gh pr diff <pr> --name-only        # or: git diff --name-only <base>...HEAD
```

### 2. Derive capture targets from the diff (the "analyse" step - no hand-listing)
Map changed frontend files to URLs generically:
- **Tools**: a changed `components/tools/<toolDir>/…` or `hooks/tools/<tool>/…` →
  toolId → URL via the repo's own rule `getToolUrlPath` in
  [toolsTaxonomy.ts:200](frontend/editor/src/core/data/toolsTaxonomy.ts): `/` + the
  id kebab-cased (`addPageNumbers` → `/add-page-numbers`).
- **Pages/routes**: changed `filesPage/*` → `/files`, etc.
- `--all`: enumerate every tool in the registry instead of just changed ones.
Write `frontend/editor/screenshots/ui-diff/targets.json` =
`[{ "id":"compress", "url":"/compress", "name":"Compress" }]`. This is what makes
it generic - the spec never names a tool.

### 3. Capture AFTER (head) then BEFORE (base)
Copy [capture-spec.template.ts](capture-spec.template.ts) →
`src/core/tests/stubbed/ui-before-after.spec.ts` (it loops `targets.json`, seeds a
sample PDF so file-dependent panels render, navigates to each URL, and screenshots
the full viewport - or the `--scope` container if given). Ensure the harness is ready
(node_modules + icons).
```
# after = current head
cd frontend/editor && PR_SHOT_SIDE=after PR_SHOT_THEME=light \
  npx playwright test --project=stubbed ui-before-after.spec.ts
# before = base, in an isolated worktree (copy the spec + targets.json in)
git worktree add ../ba-base origin/<baseRefName>        # or the merge-base
#   set up its frontend, copy spec + screenshots/ui-diff/targets.json across, then:
cd ../ba-base/frontend/editor && PR_SHOT_SIDE=before PR_SHOT_THEME=light \
  npx playwright test --project=stubbed ui-before-after.spec.ts
#   copy its screenshots/ui-diff/before/ back next to after/. Repeat with
#   PR_SHOT_THEME=dark if --theme includes dark. Remove worktree when done.
```

### 4. Auto-diff (surface what changed)
```
cd frontend/editor && node <skill>/diff-shots.mjs \
  screenshots/ui-diff/before screenshots/ui-diff/after screenshots/ui-diff
```
Produces `diff-report.json` classifying each view `unchanged | changed | added |
removed`. For each changed view it computes the bounding box of differing pixels and
writes cropped `__before_crop.png` / `__after_crop.png` / `__diff.png` to that region
(+ padding) - **unless** the change covers more than `--pagewide` of the frame, where
it keeps the full frame (`pageWide:true`). Drop `unchanged` - that's the noise the
user doesn't want.

### 5. Montage the changes
Build the manifest from the non-unchanged entries (group by tab/tool; each becomes a
state row with before/after). For changed views use the cropped `cropBefore` /
`cropAfter` from `diff-report.json` (tight on the affected region; full frame when
`pageWide`); `added`/`removed` render the "not present" placeholder. Fill
[montage-template.html](montage-template.html) (replace the `window.__BA__` data
block; base64-inline the PNGs for portability), then render one PNG per section with
[shoot-sections.mjs](shoot-sections.mjs). Optionally include the `__diff.png` overlay
as a third column.

### 6. Deliver
Output the `montage_<tab>.png` files + a short summary (N changed / added / removed,
M unchanged skipped) and a paste-ready Markdown block. GitHub has no PR-body image
API, so tell the user to drag the PNGs into the description. Do **not** post to the
PR.

## Gotchas
- Two installs (base worktree + head); junction main's node_modules only if its deps
  match that ref, else `npm ci` (see ui-walkthrough's stale-dep note).
- A view that errors on one side (refactored/removed) → that side is missing; the
  diff marks it added/removed rather than failing the run.
- Pixel diff needs equal dimensions, so capture at a fixed viewport (the template
  does); a view whose size changed is reported as "changed (dimensions differ)",
  uncropped.
- Auto-crop uses a single bounding box, so two far-apart changes give one large crop
  (or trip `--pagewide`); narrow with `--scope` if that happens.
- `getToolUrlPath` is the source of truth for tool URLs - use it, don't guess slugs.
- Don't commit `screenshots/`, the throwaway spec, or the base worktree.
