// @ts-check

import eslint from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

const srcGlobs = ["src/**/*.{js,mjs,jsx,ts,tsx}"];
const nodeGlobs = ["scripts/**/*.{js,ts,mjs}", "*.config.{js,ts,mjs}"];

const baseRestrictedImportPatterns = [
  { regex: "^\\.", message: "Use @app/* imports instead of relative imports." },
  {
    regex: "^src/",
    message: "Use @app/* imports instead of absolute src/ imports.",
  },
];

export default defineConfig(
  {
    // Everything that contains 3rd party code that we don't want to lint
    ignores: ["dist", "node_modules", "public", "src-tauri"],
  },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: baseRestrictedImportPatterns,
        },
      ],
      "@typescript-eslint/no-empty-object-type": [
        "error",
        {
          // Allow empty extending interfaces because there's no real reason not to, and it makes it obvious where to put extra attributes in the future
          allowInterfaces: "with-single-extends",
        },
      ],
      "@typescript-eslint/no-explicit-any": "off", // Temporarily disabled until codebase conformant
      "@typescript-eslint/no-require-imports": "off", // Temporarily disabled until codebase conformant
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          args: "all", // All function args must be used (or explicitly ignored)
          argsIgnorePattern: "^_", // Allow unused variables beginning with an underscore
          caughtErrors: "all", // Caught errors must be used (or explicitly ignored)
          caughtErrorsIgnorePattern: "^_", // Allow unused variables beginning with an underscore
          destructuredArrayIgnorePattern: "^_", // Allow unused variables beginning with an underscore
          varsIgnorePattern: "^_", // Allow unused variables beginning with an underscore
          ignoreRestSiblings: true, // Allow unused variables when removing attributes from objects (otherwise this requires explicit renaming like `({ x: _x, ...y }) => y`, which is clunky)
        },
      ],
    },
  },
  // Desktop-only packages must not be imported from core or proprietary code.
  // Use the stub/shadow pattern instead: define a stub in src/core/ and override in src/desktop/.
  {
    files: srcGlobs,
    ignores: ["src/desktop/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...baseRestrictedImportPatterns,
            {
              regex: "^@tauri-apps/",
              message:
                "Tauri APIs are desktop-only. Review frontend/DeveloperGuide.md for structure advice.",
            },
          ],
        },
      ],
    },
  },
  // The shared/ layer is the seed of a future packages/shared-ui — it must
  // only depend on third-party packages and on itself. If it ever imports
  // from editor or portal layers, extraction to a standalone package later
  // becomes a rewrite instead of a `git mv`.
  {
    files: ["src/shared/**/*.{js,mjs,jsx,ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...baseRestrictedImportPatterns,
            {
              regex: "^@app/",
              message:
                "src/shared/ must not depend on editor or portal layers. Use @shared/* or third-party imports only.",
            },
            {
              regex: "^@core/",
              message: "src/shared/ must not depend on src/core/.",
            },
            {
              regex: "^@proprietary/",
              message: "src/shared/ must not depend on src/proprietary/.",
            },
            {
              regex: "^@tauri-apps/",
              message: "src/shared/ must remain web-compatible (no Tauri APIs).",
            },
          ],
        },
      ],
    },
  },
  // Folders that have been cleaned up and are now conformant - stricter rules enforced here
  {
    files: [
      "src/desktop/**/*.{js,mjs,jsx,ts,tsx}",
      "src/proprietary/**/*.{js,mjs,jsx,ts,tsx}",
      "src/saas/**/*.{js,mjs,jsx,ts,tsx}",
      "src/prototypes/**/*.{js,mjs,jsx,ts,tsx}",
      "src/portal/**/*.{js,mjs,jsx,ts,tsx}",
      "src/shared/**/*.{js,mjs,jsx,ts,tsx}",
    ],
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
    },
  },
  // Config for browser scripts
  {
    files: srcGlobs,
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
  // Config for node scripts
  {
    files: nodeGlobs,
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
);
