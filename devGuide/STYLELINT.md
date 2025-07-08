# STYLELINT.md

## Usage

Apply Stylelint to your project's CSS with the following steps:

1. **NPM Script**

   - Add a script entry to your `package.json`:
     ```jsonc
     {
       "scripts": {
         "lint:css": "stylelint \"stirling-pdf/src/main/**/*.css\""
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
     npx stylelint "stirling-pdf/src/main/**/*.css"
     ```
   - Lint a single file:
     ```bash
     npx stylelint path/to/file.css
     ```
   - Apply automatic fixes:
     ```bash
     npx stylelint "stirling-pdf/src/main/**/*.css" --fix
     ```

For full configuration options and rule customization, refer to the official documentation: [https://stylelint.io](https://stylelint.io)

