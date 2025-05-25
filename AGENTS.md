# Codex Contribution Guidelines for Stirling-PDF

This file provides high-level instructions for Codex when modifying any files within this repository. Follow these rules to ensure changes remain consistent with the existing project structure.

## 1. Code Style and Formatting
- Respect the `.editorconfig` settings located in the repository root. Java files use 4 spaces; HTML, JS, and Python generally use 2 spaces. Lines should end with `LF`.
- Format Java code with `./gradlew spotlessApply` before committing.
- Review `DeveloperGuide.md` for project structure and design details before making significant changes.

## 2. Testing
- Run `./gradlew build` before committing changes to ensure the project compiles.
- If the build cannot complete due to environment restrictions, DO NOT COMMIT THE CHANGE

## 3. Commits
- Keep commits focused. Group related changes together and provide concise commit messages.
- Ensure the working tree is clean (`git status`) before concluding your work.

## 4. Pull Requests
- Summarize what was changed and why. Include build results from `./gradlew build` in the PR description.
- Note that the code was generated with the assistance of AI.

## 5. Translations
- Only modify `messages_en_GB.properties` when adding or updating translations.

