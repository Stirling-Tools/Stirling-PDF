# Test report — Replace Color & related frontend fixes

## Scope of changes

| File | Change summary |
|------|----------------|
| `frontend/src/core/hooks/tools/replaceColor/useReplaceColorOperation.ts` | **Behavior preserved, structure fixed:** `customProcessor` (mode-based endpoint selection, blob response → `File`) now lives on `replaceColorOperationConfig` only. Removed redundant `buildFormData` / `endpoint` / `multiFileEndpoint` entries and the duplicate `customProcessor` inside `useReplaceColorOperation`. |
| `frontend/src/core/components/tools/replaceColor/ReplaceColorSettings.tsx` | Formatting only (line breaks / Prettier). |
| `frontend/src/core/tools/ReplaceColor.tsx` | Formatting only (`useState` generic layout). |
| `frontend/src/core/components/tools/addStamp/StampSetupSettings.tsx` | Formatting only (`useState` generic layout). |

### API routing (unchanged logic, now single source of truth)

- **`TEXT_COLOR_REPLACEMENT`** → `POST /api/v1/misc/replace-text-colors`
- **Other modes** → `POST /api/v1/misc/replace-invert-pdf`

Each input file is posted with `responseType: "blob"` and re-wrapped as a PDF `File` with the original name.

---

## Automated checks (executed)

| Command | Result |
|---------|--------|
| `task frontend:typecheck` | **Passed** |
| `task frontend:test` | **Passed** — 48 test files, 633 tests (~9 s) |

---

## Manual QA — Replace Color

Run the app with a working backend (`task dev` or equivalent), then:

1. **Invert / replace (non-text mode)**  
   Upload a PDF, use a mode that is *not* text-colour replacement, run the tool.  
   **Expect:** request goes to `/api/v1/misc/replace-invert-pdf`; download opens as a valid PDF.

2. **Text colour replacement**  
   Switch to text colour replacement, optionally use **Scan** to populate detected colours, select sources and a replacement, run.  
   **Expect:** request goes to `/api/v1/misc/replace-text-colors`; output PDF reflects colour changes.

3. **Multiple files**  
   Queue several PDFs and process.  
   **Expect:** one processed file per input; no mixed-up filenames.

4. **Regression smoke**  
   Open **Add Stamp** settings and confirm stamp image preview still works (file only touched for formatting).

---

## Assessment

- Replace Color processing is **centralized** in `replaceColorOperationConfig`, avoiding drift between the config object and the hook.
- Typecheck and the full frontend unit suite **pass** with these changes.
- Deep validation still depends on **manual** runs against a live backend for both replace endpoints.
