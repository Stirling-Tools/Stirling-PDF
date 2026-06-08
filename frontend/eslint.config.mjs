// @ts-check

import eslint from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

const srcGlobs = [
  "editor/src/**/*.{js,mjs,jsx,ts,tsx}",
  "portal/src/**/*.{js,mjs,jsx,ts,tsx}",
  "portal/main.tsx",
  "shared/**/*.{js,mjs,jsx,ts,tsx}",
];
const nodeGlobs = [
  "scripts/**/*.{js,ts,mjs,mts}",
  "editor/scripts/**/*.{js,ts,mjs,mts}",
  "editor/*.config.{js,ts,mjs}",
  "portal/*.config.{js,ts,mjs}",
  "*.config.{js,ts,mjs}",
  ".storybook/*.{js,ts,mjs,mts,tsx}",
];

const baseRestrictedImportPatterns = [
  {
    regex: "^\\.",
    message:
      "Use a workspace alias (@app/* for editor, @portal/* for portal, @shared/*) instead of relative imports.",
  },
  {
    regex: "^src/",
    message: "Use a workspace alias instead of absolute src/ imports.",
  },
];

export default defineConfig(
  {
    // Everything that contains 3rd party code that we don't want to lint
    ignores: [
      "dist",
      "dist-portal",
      "node_modules",
      "playwright-report",
      "storybook-static",
      "test-results",
      "editor/dist",
      "editor/public",
      "editor/src-tauri",
      "editor/playwright-report",
      "editor/test-results",
      "portal/public",
    ],
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
  // Use the stub/shadow pattern instead: define a stub in editor/src/core/ and override in editor/src/desktop/.
  {
    files: srcGlobs,
    ignores: ["editor/src/desktop/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...baseRestrictedImportPatterns,
            {
              regex: "^@tauri-apps/",
              message:
                "Tauri APIs are desktop-only. Review frontend/editor/DeveloperGuide.md for structure advice.",
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
    files: ["shared/**/*.{js,mjs,jsx,ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...baseRestrictedImportPatterns,
            {
              regex: "^@app/",
              message:
                "shared/ must not depend on the editor layer (@app/* resolves into editor/src/).",
            },
            {
              regex: "^@portal/",
              message:
                "shared/ must not depend on the portal layer. Use @shared/* or third-party imports only.",
            },
            {
              regex: "^@core/",
              message: "shared/ must not depend on editor/src/core/.",
            },
            {
              regex: "^@proprietary/",
              message: "shared/ must not depend on editor/src/proprietary/.",
            },
            {
              regex: "^@tauri-apps/",
              message: "shared/ must remain web-compatible (no Tauri APIs).",
            },
          ],
        },
      ],
    },
  },
  // Stricter rules that not all sub-folders are conformant to yet
  {
    files: srcGlobs,
    ignores: [
      "editor/src/core/components/**/*.{js,mjs,jsx,ts,tsx}",
      "editor/src/core/contexts/**/*.{js,mjs,jsx,ts,tsx}",
      "editor/src/core/data/**/*.{js,mjs,jsx,ts,tsx}",
      "editor/src/core/hooks/**/*.{js,mjs,jsx,ts,tsx}",
      "editor/src/core/pages/**/*.{js,mjs,jsx,ts,tsx}",
      "editor/src/core/services/**/*.{js,mjs,jsx,ts,tsx}",
      "editor/src/core/tests/**/*.{js,mjs,jsx,ts,tsx}",
      "editor/src/core/tools/**/*.{js,mjs,jsx,ts,tsx}",
      "editor/src/core/types/**/*.{js,mjs,jsx,ts,tsx}",
      "editor/src/core/utils/**/*.{js,mjs,jsx,ts,tsx}",
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
