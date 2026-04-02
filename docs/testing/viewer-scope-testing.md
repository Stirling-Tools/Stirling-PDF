# View Scope Testing Guide

## Fix 1 — Viewer bug (8 tools)

8 tools called `useFileSelection()` directly instead of routing through
`useBaseTool`. In the viewer, this meant they operated on **all selected files**
instead of only the one being viewed. For example: 10 files loaded, viewing
file 3, running Add Stamp — all 10 files got stamped.

**Root cause:** These tools had no viewer-scope awareness. `useFileSelection()`
returns the raw workbench selection with no knowledge of which file is active in
the viewer.

**Fix:** A new hook `useViewScopedFiles` was introduced:

```ts
// Viewer → only the active file
// Everywhere else → all loaded files
const selectedFiles = useViewScopedFiles();
```

The 8 tools were updated to call this instead of `useFileSelection()`.

**Tools fixed:** Add Stamp, Add Watermark, Add Password, Add Page Numbers,
Add Attachments, Reorganize Pages, OCR, Convert

---

## Fix 2 — Page selector / active files context (all tools)

`useBaseTool` returned `selectedFiles` (checked files only) in non-viewer
contexts. In the page selector this is typically empty or stale — not the full
set of loaded files that tools should operate on.

**Fix:** `useBaseTool` was updated to use `useViewScopedFiles`, which returns
all loaded files in non-viewer contexts. This affected every tool via
`useBaseTool`.

---

## Workarounds for Compare & Merge

Two tools intentionally need all loaded files regardless of view, so they use
`ignoreViewerScope: true` in `useBaseTool`.

**Compare** — needs exactly 2 files for its Original/Edited slots. Scoping to
one file would break the comparison entirely. `ignoreViewerScope: true` is set
and `disableScopeHints: true` hides the "(this file)" button label hint. The
slot auto-mapping logic was also improved alongside this fix.

**Merge** — needs 2+ files; merging a single file is meaningless. Rather than
leaving the button silently disabled, Merge now:
- Auto-redirects to the active files view on first open from the viewer
- If the user navigates back to the viewer, shows a disabled button with a hint
  and a "Go to active files view" shortcut button

---

## How to Test

---

## Fix 1 — 8 tools (viewer scoping)

### Test steps (same for each)
1. Load 3 PDFs into workbench
2. Open viewer, navigate to file **#2**
3. Open the tool, configure settings, run
4. ✅ Only file #2 is in the results
5. ✅ Button label shows **"[Action] (this file)"**
6. ✅ A note below the button reads **"Only applying to: [filename]"**

| Tool | What to configure |
|---|---|
| **Add Stamp** | Enter any text stamp or upload an image stamp |
| **Add Watermark** | Select text watermark, enter any text |
| **Add Page Numbers** | Leave defaults |
| **Add Password** | Enter any owner + user password |
| **Add Attachments** | Attach any small file |
| **Reorganize Pages** | Enter a page range e.g. `1,2` |
| **OCR** | Leave default language |
| **Convert** | Convert PDF → any format |

---

## Fix 2 — All tools (page selector context)

### Test steps
1. Load 3 PDFs into workbench
2. Open the page selector view, do **not** check any files
3. Open any tool from the sidebar, run it
4. ✅ All 3 files are processed (not zero or a stale subset)

---

## Compare (intentionally ignores view scope)

**A — Auto-fill with exactly 2 files**
1. Load exactly 2 PDFs
2. Open Compare from either the viewer or active files view
3. ✅ Both slots are filled automatically (Original + Edited)
4. ✅ No scope hint appears on the button

**B — Manual selection with 3+ files**
1. Load 3+ PDFs
2. Open Compare
3. ✅ The first 2 files fill the slots
4. ✅ A 3rd file does not add a 3rd slot (capped at 2)

**C — File removed mid-session**
1. Load 2 PDFs, let Compare auto-fill both slots
2. Remove one file from the workbench
3. ✅ The corresponding slot clears; the other slot is unchanged

**D — Viewer mode**
1. Load 2 PDFs, open viewer
2. Open Compare from the viewer sidebar
3. ✅ Both files are still available for slot selection (not scoped to current file)

---

## Merge (intentionally ignores view scope, disabled in viewer)

**A — Auto-redirect on first open from viewer**
1. Load 2+ PDFs, open the viewer
2. Open Merge from the viewer sidebar
3. ✅ Immediately redirected to the active files view

**B — Viewer mode disabled state (after navigating back)**
1. From the active files view, open Merge, then navigate back to the viewer
2. ✅ Execute button is **disabled** with tooltip "Switch to the file editor to select multiple files"
3. ✅ A note appears: *"Merge needs 2 or more files. Head to the file editor to select them."*
4. ✅ A **"Go to active files view"** button is shown; clicking it navigates back

**C — Active files view works normally**
1. Load 3 PDFs, open Merge from the active files view
2. ✅ All 3 files appear in the merge list
3. ✅ Button shows **"Merge (3 files)"**
4. Run the merge
5. ✅ Output is a single PDF containing all 3 files

---

## Button label behaviour (all tools)

| Context | Expected button text |
|---|---|
| Viewer, 1 file loaded | `[Action]` (no suffix) |
| Viewer, 2+ files loaded | `[Action] (this file)` |
| Active files view, 1 file loaded | `[Action]` (no suffix) |
| Active files view, 2+ files loaded | `[Action] (N files)` |
| Merge in viewer | disabled — no suffix |
| Compare | never shows scope suffix (`disableScopeHints: true`) |
