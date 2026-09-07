// Deliberately minimal: oxfmt owns formatting and `task frontend:lint:colors`
// owns the theme tokens, so this only carries rules that catch real bugs.
export default {
  ignoreFiles: [
    "**/dist/**",
    "**/src-tauri/**",
    // Vendored third-party CSS (its first-party customisation file IS linted).
    "**/editor/public/css/cookieconsent.css",
  ],
  rules: {
    "no-duplicate-selectors": true,
  },
};
