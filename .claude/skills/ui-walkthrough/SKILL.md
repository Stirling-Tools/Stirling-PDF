---
name: ui-walkthrough
description: >-
  Full UI investigation of the current branch's feature. Enumerates every view
  and state (empty, populated, loading, error, each dialog/menu/panel, responsive
  breakpoints, light + dark + RTL), captures them with the stubbed Playwright
  harness, assembles a single-image HTML walkthrough with a global light/dark
  toggle slider, then runs two review passes: visual/consistency (alignment,
  spacing, professionalism, dark/light parity, contrast, truncation) and
  UX/ease-of-use (flow, discoverability, affordances, empty/error states,
  expectations). Use when asked for a UI walkthrough, screenshot review, design
  or QA pass, "find anywhere to make it easier/better for users", or before
  merging frontend work. Pass --fix to auto-apply safe frontend fixes and
  re-capture; --theme to limit themes; --no-rtl to skip RTL; --pr-link to
  publish the report on the reports branch and append its htmlpreview link to
  the branch's pull request description.
argument-hint: "[feature/area] [--fix] [--theme light|dark|both] [--no-rtl] [--breakpoints] [--pr-link]"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# UI Walkthrough

Produce a reviewable HTML walkthrough of a feature's UI in every state and theme,
then critique it. Optionally auto-fix and re-capture.

`$ARGUMENTS` may name the feature/area to focus on. If empty, scope from the
current branch diff. Flags: `--fix`, `--theme light|dark|both` (default both),
`--no-rtl`, `--breakpoints` (also capture phone/narrow widths), `--pr-link`
(step 9: publish the report and link it from the PR description).

## What this repo gives you (use it, don't reinvent)

- **Stubbed Playwright project** = backend-free screenshots via `page.route()` mocks.
  Reference implementation: `frontend/editor/src/core/tests/stubbed/files-page-screenshots.spec.ts`.
  It already shows the light / **dark** / **RTL** passes, JWT seeding, IndexedDB
  seeding, and dumping PNGs to a `screenshots/<area>/` folder. Copy its shape.
- Helpers: `frontend/editor/src/core/tests/helpers/ui-helpers.ts`
  (`uploadFiles`, `openSettings`, `waitForModalOpen`, `dismissTourTooltip`, …)
  and the `stub-test-base` fixtures (`autoGoto`, `seedJwt`, `viewport`).
- Config: `frontend/editor/playwright.config.ts` (run from `frontend/editor/`).
- Report template: [report-template.html](report-template.html) - self-contained,
  one big image at a time, a global light/dark slider that flips every shot,
  thumbnail rail, prev/next + arrow keys, and a Findings tab.

## Process

### 1. Scope the feature
- If `$ARGUMENTS` is empty: `git diff --name-only main...HEAD` and read the PR/commits.
  Identify changed pages, tools (`core/components/tools/<tool>` or `core/tools/<tool>`),
  dialogs, panels, and routes.
- Enumerate **every view and state** to capture, e.g.:
  empty / populated / loading / error / disabled; each dialog, menu, popover, tooltip;
  each tab or step; selection + multi-select; success/result panel; and (if relevant)
  permission/role variants. Write the list down before capturing - it's the report's spine.

### 2. Prepare the harness (worktree-safe)
Worktrees have no `node_modules`. From repo root:
```
cd frontend && npm ci                       # or junction main's node_modules (see memory)
```
Kill any stale dev server first (it serves old modules):
`Get-NetTCPConnection -LocalPort 5173 -State Listen | %{ Stop-Process -Id $_.OwningProcess -Force }`

### 3. Write the capture spec
Create `frontend/editor/src/core/tests/stubbed/<feature>-walkthrough.spec.ts`,
modeled on `files-page-screenshots.spec.ts`. For each enumerated view:
- stub the APIs it needs, drive the UI to that state, wait on a real locator
  (not a fixed sleep), `await settle(page)` for Mantine portals, then
  `page.screenshot({ path: shotPath("NN_name_<theme>") })`.
- Capture each view in **light and dark** (and RTL unless `--no-rtl`). Reuse the
  `enableDarkMode` / `enableRtl` init-script pattern from the reference spec
  (`localStorage["mantine-color-scheme"]="dark"` + `emulateMedia({colorScheme:"dark"})`).
- Name shots `NN_<view>_<theme>.png` so light/dark pair up by suffix.
- Prefer **stable test-ids** over translated accessible names (RTL/i18n breaks text locators).

Run it: `cd frontend/editor && npx playwright test --project=stubbed <feature>-walkthrough.spec.ts`.
Add `--project=stubbed-firefox`/`-webkit` only if cross-browser layout matters.

### 4. Build the report
- Copy `report-template.html` to `screenshots/<feature>/walkthrough.html` (so the
  relative `screenshots/...` image paths resolve, or rewrite paths to sit beside it).
- Build the manifest and inject it: replace the JSON between the
  `/*__DATA__*/` … `/*__END__*/` markers with one `views[]` entry per view
  (`{id,title,light,dark,viewport,notes}`) and an empty `findings` object you'll
  fill in step 5. Keep `light`/`dark` as relative paths while iterating; build the
  final standalone copy with them as `data:image/png;base64,...` before publishing
  it (step 9).
- The toggle slider answers the "one big image + flip light/dark for all" request:
  it shows a single large screenshot, and switching the slider re-themes every view.

### 5. Review pass 1 - visual & consistency
Open each screenshot (Read the PNG) and judge against the others:
alignment & spacing rhythm, control placement, button hierarchy, typography,
**light/dark parity** (contrast, invisible borders, washed-out text, wrong tokens),
truncation/overflow, RTL mirroring, focus states, icon consistency, professional polish.
Record each issue as a finding `{severity:high|med|low, view, title, detail, fix}`.

### 6. Review pass 2 - UX & ease of use
Walk the flow as a first-time user: discoverability, number of steps, affordance
clarity, empty-state guidance, error recovery, destructive-action confirmation,
defaults, loading feedback, mobile reachability, accessible names, and whether the
UI matches user expectations for this kind of tool. Record findings the same way.

Write both finding lists into the report's `findings.visual` / `findings.ux`,
and add short per-view `notes`. Re-inject the manifest.

### 7. If `--fix`
Only safe, self-contained frontend fixes (spacing, alignment, tokens, missing
dark-mode colors, labels, aria, obvious copy). For each: edit the component/CSS,
mark the finding `fixed:true` with what changed, then **re-run the spec** to
re-capture the affected shots and regenerate the report. Run `task frontend:check`.
Leave anything risky or ambiguous as a finding, not a change.

### 8. Deliver
Tell the user the report path and give a tight chat summary: N views ×
themes captured, top findings by severity, and (if `--fix`) what changed.
Optionally `SendUserFile` the `walkthrough.html`.

### 9. Publish the report and link it from the PR (`--pr-link`)

GitHub renders neither a repo blob nor a PR description as HTML, so a report is
viewed through **htmlpreview.github.io**, which fetches the raw file and renders it:

```
https://htmlpreview.github.io/?<raw-url>
<raw-url> = https://raw.githubusercontent.com/<owner>/<repo>/<ref>/<path>
```

Pass the raw URL (htmlpreview also rewrites `github.com/<o>/<r>/blob/<ref>/<path>`
to raw by itself). The report must be one **self-contained** file: images inlined
as `data:image/png;base64,...`, because relative `screenshots/...` paths resolve
against nothing once htmlpreview serves the file on its own.

Commit it to the long-lived `ui-walkthrough-reports` branch, never to the feature
branch: the report is a build artifact and the feature branch's diff must stay
reviewable.

```
git fetch origin ui-walkthrough-reports
git worktree add -f /tmp/ui-wt origin/ui-walkthrough-reports   # first time: git worktree add -b ui-walkthrough-reports /tmp/ui-wt origin/main
cp walkthrough.html /tmp/ui-wt/reports/<feature>-walkthrough.html
git -C /tmp/ui-wt add reports/<feature>-walkthrough.html
git -C /tmp/ui-wt commit -m "docs: add the <feature> UI walkthrough report"
git -C /tmp/ui-wt push origin HEAD:refs/heads/ui-walkthrough-reports
git worktree remove /tmp/ui-wt
```

Then attach it, and only under `--pr-link` and only when an open PR exists for
the current branch (`gh pr view --json number -q .number`; if it fails, stop and
just report the two URLs). The description is **appended to, never replaced**:

```
gh api repos/{owner}/{repo}/pulls/<n> --jq .body > /tmp/pr-body.md   # keep the original
cat >> /tmp/pr-body.md <<'MD'

## UI walkthrough

- View it rendered: https://htmlpreview.github.io/?<raw-url>
- Download: <raw-url>
MD
python3 -c "b=open('/tmp/pr-body.md').read(); assert '## UI walkthrough' in b"   # sanity
gh api -X PATCH repos/{owner}/{repo}/pulls/<n> -F body=@/tmp/pr-body.md
```

Verify before reporting success: the original body is a prefix of the new one,
the raw URL answers 200, and the htmlpreview URL renders (open it in the browser
tools). Editing the PR body is the only write allowed here - never post the link
as a PR comment.

## Gotchas
- Stale `:5173` server serves old bundles - kill it before capturing (see step 2).
- `await settle(page)` before shots or portals/transitions tear mid-capture.
- Don't commit the generated `screenshots/` or the throwaway spec unless asked.
- Don't commit the report to the feature branch either: it goes on the
  `ui-walkthrough-reports` branch (step 9).
- A report with relative `<img src>` paths renders blank through htmlpreview; the
  images must be `data:` URIs (step 9).
