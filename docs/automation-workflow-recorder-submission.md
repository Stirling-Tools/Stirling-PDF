# Design and Implementation Submission: Automation Workflow Recorder

## 1. Initial Design

The initial design is included in this pull request at:

- `docs/automation-workflow-recorder-design.md`

Design summary:

The Automation Workflow Recorder lets users record a live sequence of PDF tool operations and save it as a reusable Automate workflow. Users start recording from the Automate tool, run normal supported tools, stop recording, review the captured steps, and save the result through the existing Automate builder. The feature is designed to reuse Stirling PDF's current `useToolOperation`, `ToolRegistry`, `AutomationConfig`, IndexedDB automation storage, Automate runner, and folder-scanning export converter instead of introducing a separate workflow engine.

The original design proposed:

- A recorder context that owns active recording state and a draft step list.
- Instrumentation in `useToolOperation` after successful operations.
- Parameter serialization that avoids storing sensitive values or non-serializable runtime objects.
- Automate UI integration that lets users review and save recorded operations.
- A persistent workbench recording indicator so users can stop or discard a recording outside the Automate panel.
- No backend changes for the MVP because recorded workflows use the existing `AutomationConfig` shape.

## 2. Pull Request Link

Pull request:

- https://github.com/Stirling-Tools/Stirling-PDF/compare/main...saul1310:Stirling-PDF:feature/automation-workflow-recorder-mvp?expand=1

The branch has been pushed to the fork. The terminal environment does not have `gh` or a GitHub token available, so this is the GitHub compare link for opening the pull request from the pushed branch.

## 3. Project Guidelines

Project guidelines used for this work:

- `AGENTS.md`
- https://github.com/Stirling-Tools/Stirling-PDF/blob/main/AGENTS.md

Relevant frontend architecture guidance:

- `frontend/editor/DeveloperGuide.md`
- https://github.com/Stirling-Tools/Stirling-PDF/blob/main/frontend/editor/DeveloperGuide.md

## 4. Implementation Reflection

The implementation mostly followed the original design. The strongest part of the original design was its decision to integrate at the existing shared tool-operation layer. Adding the recorder call inside `useToolOperation` meant the feature automatically observes supported tools after they have successfully produced output and after FileContext has handled result files. That avoided a second execution path and kept file ownership inside FileContext.

The implementation also followed the design by reusing the existing Automate builder and storage model. Recorded steps are converted into a normal `AutomationConfig`, so saving, editing, running, and exporting workflows continue to use existing Automate code.

The main deviations were scope reductions for the first implementation:

- The original design included editing or reconfiguring incomplete sensitive steps in the recorder review flow. The implementation redacts sensitive values and marks those steps as incomplete, but only fully recorded steps are converted into the saved automation draft.
- The original design mentioned step reordering and richer draft editing inside the recorder context. The implementation relies on the existing Automate creation UI for editing the generated automation, so the recorder itself only starts, stops, discards, records, and removes draft state.
- The original design listed optional draft recovery through `sessionStorage`. The implementation keeps recording state in memory only, because this keeps the first version smaller and avoids persistence edge cases around sensitive or incomplete parameters.
- The original design suggested showing skipped steps in a more detailed review list. The implementation summarizes skipped steps in the recorder panel and keeps the saved automation clean by excluding unsupported, nested, sensitive, and non-serializable steps.

These changes were made to keep the feature small enough for a safe pull request while preserving the central value: a user can perform a normal multi-tool workflow and turn successful supported steps into a reusable automation without manually selecting every tool from scratch.

Validation performed:

- Focused ESLint on changed TypeScript/TSX files.
- Focused Prettier check on changed TypeScript/TSX files.
- Core frontend typecheck using `npx tsc --noEmit --project editor/src/core/tsconfig.json`.

Validation limitations:

- `task` is not installed in this environment, so `task frontend:check` could not be run.
- The focused Vitest command failed before tests executed because the local Node/Vite/Vitest setup raises `ERR_REQUIRE_ESM` while loading `editor/vitest.config.ts`. The new serializer unit test is included for CI/local environments where the configured Vitest runner loads correctly.
- Full frontend ESLint was also attempted. The default formatter crashes under the local Node 20 runtime because ESLint 10's stylish formatter calls `util.styleText`; rerunning with JSON output avoided that formatter crash and showed an existing generated-file lint error in `editor/src/assets/material-symbols-icons.d.ts`, not in this feature's changed files.
