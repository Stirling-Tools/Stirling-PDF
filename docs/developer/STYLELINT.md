# Stylelint

Stylesheets are linted by [stylelint](https://stylelint.io) using the single config at
`frontend/stylelint.config.mjs`. Run it through Task, not a local npm script:

```bash
task frontend:lint:css
```

The config deliberately carries only `no-duplicate-selectors`: `oxfmt` owns formatting and
`task frontend:lint:colors` owns the theme tokens, so stylelint is left with the rules that
catch real bugs. `ignoreFiles` excludes `**/dist/**`, `**/src-tauri/**` and the vendored
`editor/public/css/cookieconsent.css` (whose first-party customisation file is still linted).

To lint a single file:

```bash
cd frontend
npx stylelint editor/path/to/file.css
```

For full configuration options and rule customization, refer to the official documentation:
[https://stylelint.io](https://stylelint.io)