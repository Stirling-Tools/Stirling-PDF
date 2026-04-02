# Viewer Scope Testing Guide

Tests the fix ensuring tools only process the **currently viewed file** when
triggered from the viewer, not all selected files.

## Setup (applies to all tests)

1. Load **3+ files** into the workbench
2. Select all of them
3. Open the viewer and navigate to a **specific file** (not the first one)
4. Open the tool from the viewer sidebar
5. Run the operation
6. **Expected**: only the viewed file is processed; other files are unchanged

---

## Category 1 — Tools using `useBaseTool` (were already correct)

These use `useBaseTool` which has always applied viewer scope. Smoke-test only
to confirm no regression.

| Tool | Notes |
|---|---|
| Compress | Single-file tool |
| Rotate | Single-file tool |
| Split | Multi-page output |
| Remove Pages | |
| Extract Pages | |
| Extract Images | |
| Flatten | |
| Repair | |
| Sanitize | |
| Remove Blanks | |
| Remove Annotations | |
| Remove Password | |
| Add Certificate Sign | |
| Change Metadata | |
| Change Permissions | |
| Crop | |
| Adjust Contrast | |
| Adjust Page Scale | |
| Page Layout | |
| Booklet Imposition | |
| Single Large Page | |
| Get PDF Info | |
| Auto Rename | |
| Overlay PDFs | |
| Remove Image | |
| Replace Color | |
| Scanner Image Split | |
| Timestamp PDF | |
| Unlock PDF Forms | |
| Validate Signature | |
| Remove Certificate Sign | |
| Redact | |
| Edit Table of Contents | Uses `useBaseTool`; `useFileSelection` only for `clearSelections` |
| Show JS | Uses `useBaseTool`; `useFileSelection` only for `clearSelections` |

---

## Category 2 — Tools fixed in this PR (were broken, now fixed)

These bypassed `useBaseTool` and have been updated to use `useViewerScopedFiles`.

### Test steps (same for each)
1. Load 3 PDFs into workbench, select all
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

## Category 3 — Compare (intentionally ignores viewer scope)

Compare always needs exactly 2 files and must never be scoped to a single viewer
file. `ignoreViewerScope: true` is set explicitly.

### Tests

**A — Auto-fill with exactly 2 files**
1. Load exactly 2 PDFs
2. Open Compare from either the viewer or file editor
3. ✅ Both slots are filled automatically (Original + Edited)
4. ✅ No scope hint appears on the button

**B — Manual selection with 3+ files**
1. Load 3+ PDFs, select any 2
2. Open Compare
3. ✅ The 2 selected files fill the slots
4. ✅ Selecting a 3rd file does not add a 3rd slot (capped at 2)

**C — File removed mid-session**
1. Load 2 PDFs, let Compare auto-fill both slots
2. Remove one file from the workbench
3. ✅ The corresponding slot clears; the other slot is unchanged

**D — Viewer mode**
1. Load 2 PDFs, open viewer
2. Open Compare from the viewer sidebar
3. ✅ Both files are still available for slot selection (not scoped to current file)

---

## Category 4 — Merge (intentionally ignores viewer scope, disabled in viewer)

Merge requires 2+ files and is disabled in viewer mode with a redirect hint.

### Tests

**A — Viewer mode disabled state**
1. Load 2+ PDFs, open viewer
2. Open Merge from the viewer sidebar
3. ✅ Execute button is **disabled** with tooltip "Switch to the file editor to select multiple files"
4. ✅ A note appears below the button: *"Merge needs 2 or more files. Head to the file editor to select them."*
5. ✅ A **"Go to file editor"** button is shown; clicking it navigates to the file editor

**B — File editor mode works normally**
1. Load 3 PDFs, select all, open Merge from the file editor
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
| File editor, 1 file selected | `[Action]` (no suffix) |
| File editor, 2+ files selected | `[Action] (N files)` |
| Merge in viewer | disabled — no suffix |
| Compare | never shows scope suffix (`disableScopeHints: true`) |
