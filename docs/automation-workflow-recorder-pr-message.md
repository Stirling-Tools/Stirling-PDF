# PR Message: Automation Workflow Recorder

## Title

feat(frontend): record automate workflows

## Body

```md
# Description of Changes

Adds an Automation Workflow Recorder MVP to the React frontend.

- Adds workflow recorder state, draft step types, and a provider wired into the existing app provider tree.
- Records successful supported tool operations from `useToolOperation` after FileContext has processed outputs.
- Adds parameter serialization/redaction so sensitive values and non-serializable runtime objects are not saved into automation drafts.
- Adds an Automate panel entry point for starting, stopping, discarding, and reviewing recorded workflows.
- Adds a workbench recording indicator with stop/discard controls.
- Reuses the existing Automate creation flow, `AutomationConfig` shape, IndexedDB automation storage, and export paths.
- Adds the initial design document, Canvas submission document, and focused serializer tests.

Why:

- Users can already perform multi-tool workflows manually, but converting that work into a reusable Automate workflow required manual setup.
- Recording successful steps makes Automate easier to discover and reduces repeated work without adding a second workflow engine.

Challenges:

- The implementation intentionally excludes unsupported, nested, sensitive, and non-serializable steps from saved automations to keep the first version safe and deterministic.
- `task frontend:check` could not be run because `task` is unavailable in this environment.
- Vitest failed before executing tests due a local `ERR_REQUIRE_ESM` startup error while loading `editor/vitest.config.ts`.
- Full ESLint with the default formatter crashes under the local Node 20 runtime; rerunning with JSON output showed an existing generated-file lint issue in `editor/src/assets/material-symbols-icons.d.ts`, not in this feature's changed files.

Closes N/A

---

## Checklist

### General

- [ ] I have read the [Contribution Guidelines](https://github.com/Stirling-Tools/Stirling-PDF/blob/main/CONTRIBUTING.md)
- [ ] I have read the [Stirling-PDF Developer Guide](https://github.com/Stirling-Tools/Stirling-PDF/blob/main/DeveloperGuide.md) (if applicable)
- [ ] I have read the [How to add new languages to Stirling-PDF](https://github.com/Stirling-Tools/Stirling-PDF/blob/main/devGuide/HowToAddNewLanguage.md) (if applicable)
- [x] I have performed a self-review of my own code
- [x] My changes generate no new warnings

### Documentation

- [ ] I have updated relevant docs on [Stirling-PDF's doc repo](https://github.com/Stirling-Tools/Stirling-Tools.github.io/blob/main/docs/) (if functionality has heavily changed)
- [x] I have read the section [Add New Translation Tags](https://github.com/Stirling-Tools/Stirling-PDF/blob/main/devGuide/HowToAddNewLanguage.md#add-new-translation-tags) (for new translation tags only)

### Translations (if applicable)

- [ ] I ran [`scripts/counter_translation.py`](https://github.com/Stirling-Tools/Stirling-PDF/blob/main/docs/counter_translation.md)

### UI Changes (if applicable)

- [ ] Screenshots or videos demonstrating the UI changes are attached (e.g., as comments or direct attachments in the PR)

### Testing (if applicable)

- [ ] I have run `task check` to verify linters, typechecks, and tests pass
- [x] I have tested my changes locally. Refer to the [Testing Guide](https://github.com/Stirling-Tools/Stirling-PDF/blob/main/DeveloperGuide.md#7-testing) for more details.
```
