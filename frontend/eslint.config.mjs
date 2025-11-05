// @ts-check

import eslint from '@eslint/js';
import globals from 'globals';
import { defineConfig } from 'eslint/config';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import reactPlugin from 'eslint-plugin-react';
import tseslint from 'typescript-eslint';
import { fileURLToPath } from 'node:url';
import importPlugin from 'eslint-plugin-import';

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
  "**/public/**/*",
  "src-tauri/**",
  "./src-tauri/**",
  "src-tauri/**/*",
  "./src-tauri/**/*",
  "**/src-tauri/**",
  "**/src-tauri/**/*"
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
    // Everything that contains 3rd party code that we don't want to lint
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
        projectService: {
          allowDefaultProject: [
            'src/components/tooltips/usePageSelectionTips.tsx',
            'src/reportWebVitals.js',
            'src/setupTests.js'
          ],
          defaultProject: './tsconfig.json'
        },
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
      'react-hooks/exhaustive-deps': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react/display-name': 'error',
      'react/no-children-prop': 'error',
      'react/prop-types': 'error',
      'react/no-unescaped-entities': 'error',

      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/prefer-regexp-exec': 'error',
      '@typescript-eslint/prefer-includes': 'error',
      '@typescript-eslint/consistent-indexed-object-style': 'error',
      '@typescript-eslint/class-literal-property-style': 'error',
      '@typescript-eslint/consistent-type-definitions': 'error',
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
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-require-imports": "error",
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
      "no-redeclare": "error",

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
      '@typescript-eslint/array-type': 'off', // see: https://github.com/Stirling-Tools/Stirling-PDF/pull/4521#issuecomment-3346477814

      // Should be checked
      "@typescript-eslint/no-inferrable-types": "error",
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/only-throw-error': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/prefer-promise-reject-errors': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/no-base-to-string': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
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
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      sourceType: 'module',
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
      eslint.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
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
      'no-unused-vars': 'error',
      'no-console': 'error',
      'react/jsx-uses-react': 'error',
      'react/jsx-uses-vars': 'error',
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
