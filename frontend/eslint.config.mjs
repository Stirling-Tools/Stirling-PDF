// @ts-check

import eslint from '@eslint/js';
import globals from "globals";
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';

const srcGlobs = [
  'src/**/*.{js,mjs,jsx,ts,tsx}',
];
const nodeGlobs = [
  'scripts/**/*.{js,ts,mjs}',
  '*.config.{js,ts,mjs}',
];

export default defineConfig(
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    ignores: [
      "dist", // Contains 3rd party code
      "public", // Contains 3rd party code
    ],
  },
  {
    rules: {
      "@typescript-eslint/no-empty-object-type": [
        "error",
        {
          // Allow empty extending interfaces because there's no real reason not to, and it makes it obvious where to put extra attributes in the future
          allowInterfaces: 'with-single-extends',
        },
      ],
      "@typescript-eslint/no-explicit-any": "off", // Temporarily disabled until codebase conformant
      "@typescript-eslint/no-require-imports": "off", // Temporarily disabled until codebase conformant
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          "args": "all", // All function args must be used (or explicitly ignored)
          "argsIgnorePattern": "^_", // Allow unused variables beginning with an underscore
          "caughtErrors": "all", // Caught errors must be used (or explicitly ignored)
          "caughtErrorsIgnorePattern": "^_", // Allow unused variables beginning with an underscore
          "destructuredArrayIgnorePattern": "^_", // Allow unused variables beginning with an underscore
          "varsIgnorePattern": "^_", // Allow unused variables beginning with an underscore
          "ignoreRestSiblings": true, // Allow unused variables when removing attributes from objects (otherwise this requires explicit renaming like `({ x: _x, ...y }) => y`, which is clunky)
        },
      ],
    },
  },
  // Config for browser scripts
  {
    files: srcGlobs,
    languageOptions: {
      globals: {
        ...globals.browser,
      }
    }
  },
  // Config for node scripts
  {
    files: nodeGlobs,
    languageOptions: {
      globals: {
        ...globals.node,
      }
    }
  },
  {
    extends: [
      importPlugin.flatConfigs.typescript, // Use TypeScript mode for import plugin so type imports are resolved properly
    ],
    rules: {
      "import/no-cycle": "error", // Detect import cycles
    }
  },
);
