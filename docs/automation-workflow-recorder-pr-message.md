# PR Message: Automation Workflow Recorder

## Title

feat(frontend): record automate workflows

## Body

```md
## Summary
- Add Automation Workflow Recorder MVP for capturing successful supported tool operations.
- Save recorded steps into the existing Automate workflow creation flow.
- Add parameter serialization/redaction to avoid storing sensitive or non-serializable values.
- Add workbench recording controls and Automate recorder panel.
- Include design and Canvas submission docs.

## Validation
- `npx tsc --noEmit --project editor/src/core/tsconfig.json`
- Focused ESLint on changed TS/TSX files
- Focused Prettier check on changed TS/TSX files

## Notes
- `task frontend:check` could not run because `task` is unavailable in this environment.
- Vitest failed before executing tests due local `ERR_REQUIRE_ESM` config loading.
```
