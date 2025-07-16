# STYLELINT.md

## Usage

Apply Stylelint to your project's CSS with the following steps:

1. **NPM Script**

   - Go to directory: `devTools/`

   - Add Stylelint & stylistic/stylelint-plugin
     ```bash
     npm install --save-dev stylelint stylelint-config-standard
     npm install --save-dev @stylistic/stylelint-plugin
     ```
   - Add a script entry to your `package.json`:
     ```jsonc
     {
       "scripts": {
          "lint:css:check": "stylelint \"../app/core/src/main/**/*.css\" \"../app/proprietary/src/main/resources/static/css/*.css\" --config ../.stylelintrc.json",
          "lint:css:fix": "stylelint \"../app/core//src/main/**/*.css\" \"../app/proprietary/src/main/resources/static/css/*.css\" --config .stylelintrc.json --fix"
       }
     }
     ```
   - Run the linter:
     ```bash
     npm run lint:css:check
     npm run lint:css:fix
     ```

2. **CLI Usage**

   - Lint all CSS files:
     ```bash
     npx stylelint ../app/core/src/main/**/*.css ../app/proprietary/src/main/resources/static/css/*.css
     ```
   - Lint a single file:
     ```bash
     npx stylelint ../app/proprietary/src/main/resources/static/css/audit-dashboard.css
     ```
   - Apply automatic fixes:
     ```bash
     npx stylelint "../app/core/src/main/**/*.css" "../app/proprietary/src/main/resources/static/css/*.css" --fix
     ```

For full configuration options and rule customization, refer to the official documentation: [https://stylelint.io](https://stylelint.io)

