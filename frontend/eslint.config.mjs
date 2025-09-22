// @ts-check

import eslint from '@eslint/js';
import globals from 'globals';
import { defineConfig } from 'eslint/config';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import reactPlugin from 'eslint-plugin-react';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: [
      "dist", // Contains 3rd party code
      "public", // Contains 3rd party code
    ],
  },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      "no-undef": "off", // Temporarily disabled until codebase conformant
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
          args: 'all', // All function args must be used (or explicitly ignored)
          argsIgnorePattern: '^_', // Allow unused variables beginning with an underscore
          caughtErrors: 'all', // Caught errors must be used (or explicitly ignored)
          caughtErrorsIgnorePattern: '^_', // Allow unused variables beginning with an underscore
          destructuredArrayIgnorePattern: '^_', // Allow unused variables beginning with an underscore
          varsIgnorePattern: '^_', // Allow unused variables beginning with an underscore
          ignoreRestSiblings: true, // Allow unused variables when removing attributes from objects (otherwise this requires explicit renaming like `({ x: _x, ...y }) => y`, which is clunky)
        },
      ],
    },
  },
  {
    files: ['src/**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/rules-of-hooks': 'error',
    },
  },
  {
    files: [
      'src/**/*.{test,spec}.{ts,tsx}',
      'src/tests/**/*.{ts,tsx}',
    ],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.vitest,
      },
    },
  },
  {
    files: [
      'scripts/**/*.{js,ts}',
      'vite.config.ts',
      'vitest.config.ts',
      'vitest.minimal.config.ts',
      'playwright.config.ts',
      'tailwind.config.js',
      'postcss.config.js',
      'eslint.config.mjs',
    ],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  }
);
