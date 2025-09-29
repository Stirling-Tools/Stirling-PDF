// @ts-check

import eslint from '@eslint/js';
import globals from 'globals';
import { defineConfig } from 'eslint/config';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import reactPlugin from 'eslint-plugin-react';
import tseslint from 'typescript-eslint';
import { fileURLToPath } from 'node:url';

const ignorePatterns = [
  "__tests/**",
  "dist/**",
  "./dist/**",
  "dist/**/*",
  "./dist/**/*",
  "**/dist/**",
  "**/dist/**/*",
  "build/**",
  "./build/**",
  "build/**/*",
  "./build/**/*",
  "**/build/**",
  "**/build/**/*",
  "node_modules/**",
  "./node_modules/**",
  "node_modules/**/*",
  "./node_modules/**/*",
  "**/node_modules/**",
  "**/node_modules/**/*",
  "public/**",
  "./public/**",
  "public/**/*",
  "./public/**/*",
  "**/public/**",
  "**/public/**/*"
];
const jsGlobs = ['{src,frontend/src}/**/*.{js,jsx}'];
const srcGlobs = ['{src,frontend/src}/**/*.{ts,tsx}'];
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

const __dirname = fileURLToPath(new URL('./', import.meta.url));

export default defineConfig(
  { ignores: ignorePatterns },

  // Shared settings for all files
  {
    ignores: ignorePatterns,
    rules: {
      semi: "error",
      "prefer-const": "error",
    },
  },

  // Core rules for all source files
  eslint.configs.recommended,

  // Specific rules for different types of files
  {
    ignores: [
      ...ignorePatterns,
      ...jsGlobs,
      ...nodeGlobs
    ],
    files: srcGlobs,
    extends: [
      reactPlugin.configs.flat.recommended,
      reactPlugin.configs.flat['jsx-runtime'],
      ...tseslint.configs.recommendedTypeChecked,
    ],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      // Enabled rules
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/rules-of-hooks': 'warn',
      'react/display-name': 'warn',
      'react/no-children-prop': 'warn',
      'react/prop-types': 'warn',
      'react/no-unescaped-entities': 'warn',

      '@typescript-eslint/array-type': ['warn', { default: 'array', readonly: 'array' }],
      '@typescript-eslint/require-await': 'warn',
      '@typescript-eslint/no-unnecessary-type-assertion': 'warn',
      '@typescript-eslint/prefer-regexp-exec': 'warn',
      '@typescript-eslint/prefer-includes': 'warn',
      '@typescript-eslint/consistent-indexed-object-style': 'warn',
      '@typescript-eslint/class-literal-property-style': 'warn',
      '@typescript-eslint/consistent-type-definitions': 'warn',
      "@typescript-eslint/no-empty-object-type": [
        "error",
        {
          // Allow empty extending interfaces because there's no real reason not to, and it makes it obvious where to put extra attributes in the future
          allowInterfaces: 'with-single-extends',
        },
      ],
      "@typescript-eslint/no-explicit-any": "warn", // Temporarily disabled until codebase conformant
      "@typescript-eslint/no-require-imports": "warn", // Temporarily disabled until codebase conformant
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
      "no-redeclare": "warn", // Disallow variable redeclaration

      // Disabled rules (too restrictive or not useful for this codebase)
      'react/react-in-jsx-scope': 'off', // Not needed with React 17+
      "no-unused-vars": "off", // Use the TypeScript version instead
      "no-undef": "off", // Use the TypeScript version instead
      '@typescript-eslint/no-empty-function': 'off', // Ignore empty functions (they're often useful)
      '@typescript-eslint/prefer-nullish-coalescing': 'off', // Ignore preference of ?? over || (both have their uses)
      '@typescript-eslint/unbound-method': 'off', // Ignore unbound methods (they're often useful)
      '@typescript-eslint/restrict-template-expressions': 'off', // Ignore restrictions on template expressions (they're often useful)
      '@typescript-eslint/dot-notation': 'off', // Ignore dot notation (it's often more readable to use bracket notation)
      '@typescript-eslint/non-nullable-type-assertion-style': 'off', // Ignore preference of using !. over other methods (both have their uses)
      '@typescript-eslint/consistent-generic-constructors': 'off', // Ignore preference of using new Array<T>() over Array<T> (both have their uses)
      '@typescript-eslint/no-redundant-type-constituents': 'off', // Ignore redundant type constituents (they're often useful for clarity)

      // Should be checked
      "@typescript-eslint/no-inferrable-types": "off",
      '@typescript-eslint/await-thenable': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-arguments': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/only-throw-error': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/prefer-promise-reject-errors': 'off',
      '@typescript-eslint/prefer-optional-chain': 'off',
      '@typescript-eslint/no-base-to-string': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
    },
  },
  {
    ignores: [
      ...ignorePatterns,
      ...jsGlobs
    ],
    files: nodeGlobs,
    extends: [
      tseslint.configs.disableTypeChecked
    ],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: jsGlobs,
    ignores: [
      ...nodeGlobs,
      ...ignorePatterns
    ],
    extends: [
      reactPlugin.configs.flat.recommended,
      ...tseslint.configs.recommended,
    ],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
        projectService: true,
        tsconfigRootDir: __dirname,
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
    },
    settings: { react: { version: 'detect' } },
    rules: {
      'no-unused-vars': 'warn',
      'no-console': 'error',
      'react/jsx-uses-react': 'error',
      'react/jsx-uses-vars': 'error',
    }
  }
);
