import { defineConfig } from "oxlint";

// App source globs
const srcGlobs = [
  "editor/src/**/*.{js,mjs,jsx,ts,tsx}",
  "portal/src/**/*.{js,mjs,jsx,ts,tsx}",
  "portal/main.tsx",
  "shared/**/*.{js,mjs,jsx,ts,tsx}",
];

// Node-tooling globs (scripts, config files, storybook).
const nodeGlobs = [
  "scripts/**/*.{js,ts,mjs,mts}",
  "editor/scripts/**/*.{js,ts,mjs,mts}",
  "editor/*.config.{js,ts,mjs}",
  "portal/*.config.{js,ts,mjs}",
  "*.config.{js,ts,mjs}",
  ".storybook/*.{js,ts,mjs,mts,tsx}",
];

// editor/src/core subfolders not yet conformant to the stricter type rules
const coreNotYetConformant = [
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
];

// Imports must use workspace aliases, never relative or absolute-src paths.
const aliasImportPatterns = [
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

const tauriPattern = {
  regex: "^@tauri-apps/",
  message:
    "Tauri APIs are desktop-only. Review frontend/editor/DeveloperGuide.md for structure advice.",
};

// shared/ must only depend on third-party packages and itself.
const sharedLayerPatterns = [
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
  { regex: "^@core/", message: "shared/ must not depend on editor/src/core/." },
  {
    regex: "^@proprietary/",
    message: "shared/ must not depend on editor/src/proprietary/.",
  },
  {
    regex: "^@tauri-apps/",
    message: "shared/ must remain web-compatible (no Tauri APIs).",
  },
];

export default defineConfig({
  plugins: ["typescript", "import"],
  categories: { correctness: "off" },
  env: { builtin: true },
  ignorePatterns: [
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
  rules: {
    "constructor-super": "error",
    "for-direction": "error",
    "getter-return": "error",
    "no-async-promise-executor": "error",
    "no-case-declarations": "error",
    "no-class-assign": "error",
    "no-compare-neg-zero": "error",
    "no-cond-assign": "error",
    "no-const-assign": "error",
    "no-constant-binary-expression": "error",
    "no-constant-condition": "error",
    "no-control-regex": "error",
    "no-debugger": "error",
    "no-delete-var": "error",
    "no-dupe-class-members": "error",
    "no-dupe-else-if": "error",
    "no-dupe-keys": "error",
    "no-duplicate-case": "error",
    "no-empty": "error",
    "no-empty-character-class": "error",
    "no-empty-pattern": "error",
    "no-empty-static-block": "error",
    "no-ex-assign": "error",
    "no-extra-boolean-cast": "error",
    "no-fallthrough": "error",
    "no-func-assign": "error",
    "no-global-assign": "error",
    "no-import-assign": "error",
    "no-invalid-regexp": "error",
    "no-irregular-whitespace": "error",
    "no-loss-of-precision": "error",
    "no-misleading-character-class": "error",
    "no-new-native-nonconstructor": "error",
    "no-nonoctal-decimal-escape": "error",
    "no-obj-calls": "error",
    "no-prototype-builtins": "error",
    "no-redeclare": "error",
    "no-regex-spaces": "error",
    "no-self-assign": "error",
    "no-setter-return": "error",
    "no-shadow-restricted-names": "error",
    "no-sparse-arrays": "error",
    "no-this-before-super": "error",
    "no-unassigned-vars": "error",
    "no-unexpected-multiline": "error",
    "no-unreachable": "error",
    "no-unsafe-finally": "error",
    "no-unsafe-negation": "error",
    "no-unsafe-optional-chaining": "error",
    "no-unused-labels": "error",
    "no-unused-private-class-members": "error",
    "no-unused-vars": [
      "error",
      {
        args: "all",
        argsIgnorePattern: "^_",
        caughtErrors: "all",
        caughtErrorsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        ignoreRestSiblings: true,
      },
    ],
    "no-useless-backreference": "error",
    "no-useless-catch": "error",
    "no-useless-escape": "error",
    "no-with": "error",
    "preserve-caught-error": "error",
    "require-yield": "error",
    "use-isnan": "error",
    "valid-typeof": "error",
    "no-array-constructor": "error",
    "no-unused-expressions": "error",
    "no-restricted-imports": ["error", { patterns: aliasImportPatterns }],
    "import/no-cycle": "error",
    "typescript/ban-ts-comment": "error",
    "typescript/no-duplicate-enum-values": "error",
    "typescript/no-empty-object-type": [
      "error",
      { allowInterfaces: "with-single-extends" },
    ],
    "typescript/no-extra-non-null-assertion": "error",
    "typescript/no-misused-new": "error",
    "typescript/no-namespace": "error",
    "typescript/no-non-null-asserted-optional-chain": "error",
    "typescript/no-this-alias": "error",
    "typescript/no-unnecessary-type-constraint": "error",
    "typescript/no-unsafe-declaration-merging": "error",
    "typescript/no-unsafe-function-type": "error",
    "typescript/no-wrapper-object-types": "error",
    "typescript/prefer-as-const": "error",
    "typescript/prefer-namespace-keyword": "error",
    "typescript/triple-slash-reference": "error",
  },
  overrides: [
    {
      files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
      rules: {
        "constructor-super": "off",
        "getter-return": "off",
        "no-class-assign": "off",
        "no-const-assign": "off",
        "no-dupe-class-members": "off",
        "no-dupe-keys": "off",
        "no-func-assign": "off",
        "no-import-assign": "off",
        "no-new-native-nonconstructor": "off",
        "no-obj-calls": "off",
        "no-redeclare": "off",
        "no-setter-return": "off",
        "no-this-before-super": "off",
        "no-unreachable": "off",
        "no-unsafe-negation": "off",
        "no-var": "error",
        "no-with": "off",
        "prefer-const": "error",
        "prefer-rest-params": "error",
        "prefer-spread": "error",
      },
    },
    {
      files: srcGlobs,
      rules: {
        "no-restricted-imports": [
          "error",
          { patterns: [...aliasImportPatterns, tauriPattern] },
        ],
      },
    },
    {
      files: ["shared/**/*.{js,mjs,jsx,ts,tsx}"],
      rules: {
        "no-restricted-imports": [
          "error",
          { patterns: [...aliasImportPatterns, ...sharedLayerPatterns] },
        ],
      },
    },
    {
      files: ["editor/src/desktop/**/*.{js,mjs,jsx,ts,tsx}"],
      rules: {
        "no-restricted-imports": ["error", { patterns: aliasImportPatterns }],
      },
    },
    {
      files: srcGlobs,
      rules: {
        "typescript/no-explicit-any": "error",
      },
      env: { browser: true },
    },
    {
      files: coreNotYetConformant,
      rules: {
        "typescript/no-explicit-any": "off",
      },
    },
    {
      files: nodeGlobs,
      env: { node: true },
    },
  ],
});
