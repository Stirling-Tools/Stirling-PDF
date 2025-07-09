# STYLELINT.md

## Usage

Apply Stylelint to your project's CSS with the following steps:

1. **NPM Script**

   - Add Stylelint & stylistic/stylelint-plugin
     ```bash
     npm install --save-dev stylelint stylelint-config-standard
     npm install --save-dev @stylistic/stylelint-plugin
     ```
   - Add a script entry to your `package.json`:
     ```jsonc
     {
       "scripts": {
         "lint:css": "stylelint \"stirling-pdf/src/main/**/*.css\" \"proprietary/src/main/resources/static/css/*.css\" --fix"
       }
     }
     ```
   - Run the linter:
     ```bash
     npm run lint:css
     ```

2. **CLI Usage**

   - Lint all CSS files:
     ```bash
     npx stylelint "stylelint \"stirling-pdf/src/main/**/*.css\" \"proprietary/src/main/resources/static/css/*.css\""
     ```
   - Lint a single file:
     ```bash
     npx stylelint path/to/file.css
     ```
   - Apply automatic fixes:
     ```bash
     npx stylelint "stirling-pdf/src/main/**/*.css" "proprietary/src/main/resources/static/css/*.css" --fix
     ```

For full configuration options and rule customization, refer to the official documentation: [https://stylelint.io](https://stylelint.io)

