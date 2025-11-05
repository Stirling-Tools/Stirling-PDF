// @ts-check

import eslint from '@eslint/js';
import globals from 'globals';
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
  {
    // Everything that contains 3rd party code that we don't want to lint
    ignores: [
      'dist',
      'node_modules',
      'public',
      'src-tauri',
    ],
  },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ".*", // Disallow any relative imports (they should be '@app/x/y/z' or similar)
            "src/*", // Disallow any absolute imports (they should be '@app/x/y/z' or similar)
          ],
        },
      ],
      '@typescript-eslint/no-empty-object-type': [
        'error',
        {
          // Allow empty extending interfaces because there's no real reason not to, and it makes it obvious where to put extra attributes in the future
          allowInterfaces: 'with-single-extends',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'off', // Temporarily disabled until codebase conformant
      '@typescript-eslint/no-require-imports': 'off', // Temporarily disabled until codebase conformant
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          'args': 'all', // All function args must be used (or explicitly ignored)
          'argsIgnorePattern': '^_', // Allow unused variables beginning with an underscore
          'caughtErrors': 'all', // Caught errors must be used (or explicitly ignored)
          'caughtErrorsIgnorePattern': '^_', // Allow unused variables beginning with an underscore
          'destructuredArrayIgnorePattern': '^_', // Allow unused variables beginning with an underscore
          'varsIgnorePattern': '^_', // Allow unused variables beginning with an underscore
          'ignoreRestSiblings': true, // Allow unused variables when removing attributes from objects (otherwise this requires explicit renaming like `({ x: _x, ...y }) => y`, which is clunky)
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
  // Config for import plugin
  {
    ...importPlugin.flatConfigs.recommended,
    ...importPlugin.flatConfigs.typescript,
    rules: {
      // ...importPlugin.flatConfigs.recommended.rules, // Temporarily disabled until codebase conformant
      ...importPlugin.flatConfigs.typescript.rules,
      'import/no-cycle': 'error',
    },
    settings: {
      'import/resolver': {
        typescript: {
          project: './tsconfig.json',
        },
      },
    },
  },
);
