import { defineConfig, type OxlintGlobals } from "oxlint";

// Glob for all editor app source, and the two layers that need their own
// import scope. `no-restricted-imports` is repeated per scope on purpose:
// oxlint REPLACES (does not merge) a rule across matching overrides, so each
// scope must restate the full set of bans that apply to it.
const APP_SOURCE = "editor/src/**/*.{js,mjs,jsx,ts,tsx}";
const DESKTOP_SOURCE = "editor/src/desktop/**/*.{js,mjs,jsx,ts,tsx}";
const CLOUD_SOURCE = "editor/src/cloud/**/*.{js,mjs,jsx,ts,tsx}";

// Shared import-ban building blocks -----------------------------------------

const aliasOverRelative = {
  regex: "^\\.",
  message:
    "Use a workspace alias (@app/* for editor, @portal/* for portal) instead of relative imports.",
};
const aliasOverSrc = {
  regex: "^src/",
  message: "Use a workspace alias instead of absolute src/ imports.",
};
const noTauriOutsideDesktop = {
  regex: "^@tauri-apps/",
  message:
    "Tauri APIs are desktop-only. Review frontend/editor/DeveloperGuide.md for structure advice.",
};
const cloudNoTauri = {
  regex: "^@tauri-apps/",
  message:
    "cloud/ must stay platform-portable. Tauri APIs are desktop-only — reach native features via an @app/* seam (e.g. @app/platform/openExternal).",
};
const cloudNoSupabase = {
  regex: "^@supabase/",
  message:
    "cloud/ must stay platform-portable. Reach Supabase via an @app/* seam (e.g. @app/auth/supabase, @app/auth/session) provided per-platform in saas/ and desktop/.",
};

// Shared-DS Button/SegmentedControl/Chip family must come from @app/ui, not
// Mantine. (The raw-<button> ban from the ESLint config used
// no-restricted-syntax, which oxlint does not implement, so it is dropped.)
const mantineDsPaths = [
  {
    name: "@mantine/core",
    importNames: [
      "Button",
      "ActionIcon",
      "UnstyledButton",
      "CloseButton",
      "FileButton",
    ],
    message:
      'Use the shared Button (@app/ui/Button) instead of the Mantine button family. variant=primary|secondary|tertiary, accent=default|neutral|brand|ai|premium|danger|success|warning; an icon-only button is `<Button leftSection={…} aria-label="…" />`. If no variant fits, extend the shared Button rather than importing Mantine.',
  },
  {
    name: "@mantine/core",
    importNames: ["SegmentedControl"],
    message:
      "Use the shared SegmentedControl (@app/ui/SegmentedControl) instead of Mantine's.",
  },
  {
    name: "@mantine/core",
    importNames: ["Chip", "Pill"],
    message:
      "Use the shared Chip (@app/ui/Chip) instead of Mantine's Chip/Pill.",
  },
];

// Modern JS globals not yet in oxlint's builtin env.
const modernGlobals: OxlintGlobals = {
  AsyncDisposableStack: "readonly",
  DisposableStack: "readonly",
  SuppressedError: "readonly",
};

// Folders not yet conformant to the stricter no-explicit-any rule; migrated
// incrementally. Preserved verbatim from the ESLint config's ignore list.
const noExplicitAnyExcludes = [
  "editor/src/core/components/annotation/**/*.{js,mjs,jsx,ts,tsx}",
  "editor/src/core/components/pageEditor/*.{js,mjs,jsx,ts,tsx}",
  "editor/src/core/components/pageEditor/commands/*.{js,mjs,jsx,ts,tsx}",
  "editor/src/core/components/pageEditor/hooks/*.{js,mjs,jsx,ts,tsx}",
  "editor/src/core/components/shared/*.{js,mjs,jsx,ts,tsx}",
  "editor/src/core/components/shared/config/*.{js,mjs,jsx,ts,tsx}",
  "editor/src/core/components/shared/config/configSections/*.{js,mjs,jsx,ts,tsx}",
  "editor/src/core/components/shared/pageEditor/*.{js,mjs,jsx,ts,tsx}",
  "editor/src/core/components/tools/*.{js,mjs,jsx,ts,tsx}",
  "editor/src/core/components/tools/addStamp/*.{js,mjs,jsx,ts,tsx}",
  "editor/src/core/components/tools/automate/*.{js,mjs,jsx,ts,tsx}",
  "editor/src/core/components/tools/bookletImposition/*.{js,mjs,jsx,ts,tsx}",
  "editor/src/core/components/tools/certSign/*.{js,mjs,jsx,ts,tsx}",
  "editor/src/core/components/tools/pdfTextEditor/*.{js,mjs,jsx,ts,tsx}",
  "editor/src/core/components/tools/shared/*.{js,mjs,jsx,ts,tsx}",
  "editor/src/core/components/viewer/*.{js,mjs,jsx,ts,tsx}",
  "editor/src/core/contexts/*.{js,mjs,jsx,ts,tsx}",
  "editor/src/core/contexts/file/*.{js,mjs,jsx,ts,tsx}",
  "editor/src/core/contexts/viewer/*.{js,mjs,jsx,ts,tsx}",
  "editor/src/core/hooks/*.{js,mjs,jsx,ts,tsx}",
  "editor/src/core/hooks/signing/*.{js,mjs,jsx,ts,tsx}",
  "editor/src/core/hooks/tools/adjustContrast/*.{js,mjs,jsx,ts,tsx}",
  "editor/src/core/hooks/tools/convert/*.{js,mjs,jsx,ts,tsx}",
  "editor/src/core/hooks/tools/removePassword/*.{js,mjs,jsx,ts,tsx}",
  "editor/src/core/hooks/tools/shared/*.{js,mjs,jsx,ts,tsx}",
  "editor/src/core/services/*.{js,mjs,jsx,ts,tsx}",
  "editor/src/core/tools/annotate/useAnnotationSelection.ts",
  "editor/src/core/types/*.{js,mjs,jsx,ts,tsx}",
  "editor/src/core/utils/*.{js,mjs,jsx,ts,tsx}",
];

export default defineConfig({
  plugins: ["typescript", "import"],
  categories: {
    correctness: "off",
  },
  env: {
    builtin: true,
  },
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
    "no-restricted-imports": [
      "error",
      {
        patterns: [aliasOverRelative, aliasOverSrc],
      },
    ],
    "typescript/ban-ts-comment": "error",
    "typescript/no-duplicate-enum-values": "error",
    "typescript/no-empty-object-type": [
      "error",
      {
        allowInterfaces: "with-single-extends",
      },
    ],
    "typescript/no-extra-non-null-assertion": "error",
    "typescript/no-misused-new": "error",
    "typescript/no-namespace": "error",
    "typescript/no-non-null-asserted-optional-chain": "error",
    "typescript/no-require-imports": "error",
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
      // TS files: core JS rules superseded by the TypeScript compiler are turned
      // off, and the TS-appropriate replacements are enabled. Mirrors
      // typescript-eslint's recommended flat config.
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
      // Browser globals for all editor app source.
      files: [APP_SOURCE],
      env: {
        browser: true,
      },
      globals: modernGlobals,
    },
    {
      // Node globals for build scripts, config files, and Storybook config.
      files: [
        "scripts/**/*.{js,ts,mjs,mts}",
        "editor/scripts/**/*.{js,ts,mjs,mts}",
        "editor/*.config.{js,ts,mjs}",
        "*.config.{js,ts,mjs}",
        ".storybook/*.{js,ts,mjs,mts,tsx}",
      ],
      globals: modernGlobals,
      env: {
        node: true,
      },
    },
    {
      // Editor app source (excluding desktop): ban relative/src imports, ban
      // Tauri (desktop-only), and the shared-DS Mantine import ban.
      files: [APP_SOURCE],
      excludeFiles: [DESKTOP_SOURCE],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [aliasOverRelative, aliasOverSrc, noTauriOutsideDesktop],
            paths: mantineDsPaths,
          },
        ],
      },
    },
    {
      // Desktop source: same DS import ban, but Tauri is allowed here (this is
      // the only layer that may reach @tauri-apps/* directly).
      files: [DESKTOP_SOURCE],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [aliasOverRelative, aliasOverSrc],
            paths: mantineDsPaths,
          },
        ],
      },
    },
    {
      // The cloud/ layer is the SHARED hosted/SaaS experience consumed by BOTH
      // the saas and desktop leaves, so it must stay platform-portable: no
      // Supabase or Tauri directly, and no raw fetch/localStorage/sessionStorage
      // — those arrive via @app/* seams that each leaf provides for its own
      // platform. (The window.location and import.meta.env bans from the ESLint
      // config used no-restricted-syntax, which oxlint does not implement, so
      // they are dropped.)
      files: [CLOUD_SOURCE],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              aliasOverRelative,
              aliasOverSrc,
              cloudNoTauri,
              cloudNoSupabase,
            ],
            paths: mantineDsPaths,
          },
        ],
        "no-restricted-globals": [
          "error",
          {
            name: "fetch",
            message:
              "cloud/ must not call raw fetch — use @app/services/apiClient so each platform supplies its own transport.",
          },
          {
            name: "localStorage",
            message:
              "cloud/ must not touch localStorage — use an @app/* storage seam so desktop/web can differ.",
          },
          {
            name: "sessionStorage",
            message:
              "cloud/ must not touch sessionStorage — use an @app/* storage seam so desktop/web can differ.",
          },
        ],
      },
    },
    {
      // Exempt from the shared-DS Mantine import ban (these layers may use
      // Mantine directly): the shared DS itself wraps Mantine, stories/tests
      // demo it, and prototypes are not shipped. Module-path bans still apply.
      // The three named files are ARIA tablist/segmented controls that the
      // ESLint config exempted from the (now-dropped) raw-<button> and Mantine
      // rules. Comes after the scoped bans above so it wins for these files;
      // desktop/cloud keep theirs.
      files: [
        "editor/src/core/ui/**/*.{js,mjs,jsx,ts,tsx}",
        "editor/src/prototypes/**/*.{js,mjs,jsx,ts,tsx}",
        "**/*.stories.{js,mjs,jsx,ts,tsx}",
        "**/*.test.{js,mjs,jsx,ts,tsx}",
        "editor/src/core/components/shared/FileSelectorPicker.tsx",
        "editor/src/core/components/filesPage/FileManagerView.tsx",
        "editor/src/core/pages/HomePage.tsx",
      ],
      excludeFiles: [DESKTOP_SOURCE, CLOUD_SOURCE],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [aliasOverRelative, aliasOverSrc, noTauriOutsideDesktop],
          },
        ],
      },
    },
    {
      // Desktop test/story files: like every other *.test/*.stories file they
      // are exempt from the shared-DS Mantine import ban; being desktop they also
      // keep the Tauri allowance.
      files: [
        "editor/src/desktop/**/*.test.{js,mjs,jsx,ts,tsx}",
        "editor/src/desktop/**/*.stories.{js,mjs,jsx,ts,tsx}",
      ],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [aliasOverRelative, aliasOverSrc],
          },
        ],
      },
    },
    {
      // Stricter no-explicit-any, enabled everywhere in the editor app EXCEPT
      // the folders that are not yet conformant (migrated incrementally).
      files: [APP_SOURCE],
      excludeFiles: noExplicitAnyExcludes,
      rules: {
        "typescript/no-explicit-any": "error",
      },
    },
    {
      // Circular-import detection across the editor app source (the import
      // plugin resolves @app/* and the other tsconfig path aliases). Replaces
      // the previous dpdm pass.
      files: ["editor/src/**/*.{ts,tsx}"],
      rules: {
        "import/no-cycle": "error",
      },
    },
  ],
});
