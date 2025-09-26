// @ts-check
import { fileURLToPath } from 'node:url';

import eslint from '@eslint/js';
import globals from 'globals';
import { defineConfig } from 'eslint/config';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import reactPlugin from 'eslint-plugin-react';
import tseslint from 'typescript-eslint';

const tsconfigRootDir = fileURLToPath(new URL('./', import.meta.url));

const srcGlobs = ['{src,frontend/src}/**/*.{ts,tsx,js,jsx}'];
const srcTsGlobs = ['{src,frontend/src}/**/*.{ts,tsx}'];
const nodeGlobs = [
  'scripts/**/*.{js,ts,mjs}',
  'vite.config.ts',
  'vitest.config.ts',
  'vitest.minimal.config.ts',
  'playwright.config.ts',
  'tailwind.config.js',
  'postcss.config.js',
  'eslint.config.mjs',
];

export default defineConfig(
  {
    ignores: [
      "dist", // Contains 3rd party code
      "public", // Contains 3rd party code
    ],
  },
  eslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    extends: [...tseslint.configs.recommended],
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
        "warn",
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
    files: srcTsGlobs,
    extends: [
      ...tseslint.configs.recommendedTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir,
      },
    },
  },
  {
    files: srcGlobs,
    extends: [reactPlugin.configs.flat.recommended],
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
      'react/react-in-jsx-scope': 'off', // Not needed with React 17+

      'react-hooks/exhaustive-deps': 'off', // Temporarily disabled until codebase conformant
      'react-hooks/rules-of-hooks': 'warn',
      '@typescript-eslint/no-empty-function': 'off',

      '@typescript-eslint/no-unsafe-member-access': 'off', // Temporarily disabled until codebase conformant
      '@typescript-eslint/no-explicit-any': 'off', // Temporarily disabled until codebase conformant
      "@typescript-eslint/no-inferrable-types": "off", // Temporarily disabled until codebase conformant
      '@typescript-eslint/prefer-nullish-coalescing': 'off', // Temporarily disabled until codebase conformant
      '@typescript-eslint/no-unsafe-assignment': 'off', // Temporarily disabled until codebase conformant
      '@typescript-eslint/no-unsafe-return': 'off', // Temporarily disabled until codebase conformant
      '@typescript-eslint/no-unsafe-call': 'off', // Temporarily disabled until codebase conformant
      '@typescript-eslint/no-unsafe-arguments': 'off', // Temporarily disabled until codebase conformant
      '@typescript-eslint/no-unsafe-argument': 'off', // Temporarily disabled until codebase conformant
      '@typescript-eslint/require-await': 'off', // Temporarily disabled until codebase conformant
      '@typescript-eslint/only-throw-error': 'off', // Temporarily disabled until codebase conformant
      '@typescript-eslint/no-floating-promises': 'off', // Temporarily disabled until codebase conformant
      '@typescript-eslint/prefer-promise-reject-errors': 'off', // Temporarily disabled until codebase conformant
      '@typescript-eslint/prefer-optional-chain': 'off', // Temporarily disabled until codebase conformant
      '@typescript-eslint/no-unnecessary-type-assertions': 'off', // Temporarily disabled until codebase conformant
      '@typescript-eslint/unbound-method': 'off', // Temporarily disabled until codebase conformant
      '@typescript-eslint/no-base-to-string': 'off', // Temporarily disabled until codebase conformant
      '@typescript-eslint/no-misused-promises': 'off', // Temporarily disabled until codebase conformant
      '@typescript-eslint/no-unnecessary-type-assertion': 'off', // Temporarily disabled until codebase conformant
      '@typescript-eslint/restrict-template-expressions': 'off', // Temporarily disabled until codebase conformant
      '@typescript-eslint/dot-notation': 'off', // Temporarily disabled until codebase conformant
      '@typescript-eslint/prefer-regexp-exec': 'off', // Temporarily disabled until codebase conformant
      '@typescript-eslint/prefer-includes': 'off', // Temporarily disabled until codebase conformant
      '@typescript-eslint/consistent-indexed-object-style': 'off', // Temporarily disabled until codebase conformant
      '@typescript-eslint/non-nullable-type-assertion-style': 'off', // Temporarily disabled until codebase conformant
      '@typescript-eslint/consistent-generic-constructors': 'off', // Temporarily disabled until codebase conformant
      '@typescript-eslint/class-literal-property-style': 'off', // Temporarily disabled until codebase conformant
      '@typescript-eslint/consistent-type-definitions': 'off', // Temporarily disabled until codebase conformant
      '@typescript-eslint/no-redundant-type-constituents': 'off', // Temporarily disabled until codebase conformant

      'react/no-children-prop': 'warn', // Children should be passed as actual children, not via the children prop
      'react/prop-types': 'off', // We use TypeScript's types for props instead
      'react/display-name': 'off', // Temporarily disabled until codebase conformant
      'react/no-unescaped-entities': 'off', // Temporarily disabled until codebase conformant
    },
  },
  {
    files: [
      'src/**/*.{test,spec}.{ts,tsx}',
      'src/tests/**/*.{ts,tsx}',
    ],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.vitest,
      },
    },
  },
  {
    files: nodeGlobs,
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  }
);
