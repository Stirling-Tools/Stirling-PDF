// @ts-check

import eslint from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

const srcGlobs = [
  // The portal layers live under editor/src/portal (base) and
  // editor/src/portal-saas (saas override), so editor/src/** covers them.
  "editor/src/**/*.{js,mjs,jsx,ts,tsx}",
];
const nodeGlobs = [
  "scripts/**/*.{js,ts,mjs,mts}",
  "editor/scripts/**/*.{js,ts,mjs,mts}",
  // Covers editor/vite.config.ts and editor/vitest.config.ts.
  "editor/*.config.{js,ts,mjs}",
  "*.config.{js,ts,mjs}",
  ".storybook/*.{js,ts,mjs,mts,tsx}",
];

const baseRestrictedImportPatterns = [
  {
    regex: "^\\.",
    message:
      "Use a workspace alias (@app/* for editor, @portal/* for portal) instead of relative imports.",
  },
  {
    regex: "^src/",
    message: "Use a workspace alias instead of absolute src/ imports.",
  },
];

// Button/SegmentedControl/Chip must come from the shared DS (@app/ui), not Mantine.
// If no variant fits, extend @app/ui — that layer (editor/src/core/ui) is exempt below.
const mantineComponentImportRestrictions = [
  {
    selector:
      "ImportDeclaration[source.value='@mantine/core'] > ImportSpecifier[imported.name=/^(Button|ActionIcon|UnstyledButton|CloseButton|FileButton)$/]",
    message:
      'Use the shared Button (@app/ui/Button) instead of the Mantine button family. variant=primary|secondary|tertiary, accent=default|neutral|brand|ai|premium|danger|success|warning; an icon-only button is `<Button leftSection={…} aria-label="…" />`. If no variant fits, extend the shared Button rather than importing Mantine.',
  },
  {
    selector:
      "ImportDeclaration[source.value='@mantine/core'] > ImportSpecifier[imported.name='SegmentedControl']",
    message:
      "Use the shared SegmentedControl (@app/ui/SegmentedControl) instead of Mantine's.",
  },
  {
    selector:
      "ImportDeclaration[source.value='@mantine/core'] > ImportSpecifier[imported.name=/^(Chip|Pill)$/]",
    message:
      "Use the shared Chip (@app/ui/Chip) instead of Mantine's Chip/Pill.",
  },
];

// Raw <button> should be a shared Button too — but bespoke CSS-styled controls
// (tabs, nav rows, preset chips) can be exempted from this selector alone.
const rawButtonSyntaxRestriction = {
  selector: "JSXOpeningElement[name.name='button']",
  message:
    "Use the shared Button (@app/ui/Button) instead of a raw <button> element. If no variant fits, extend the shared Button.",
};

const sharedComponentSyntaxRestrictions = [
  ...mantineComponentImportRestrictions,
  rawButtonSyntaxRestriction,
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
  // The cloud/ layer is the SHARED hosted/SaaS experience consumed by BOTH the
  // saas and desktop leaves, so it must stay platform-portable. It must not
  // reach platform-specific things directly (Supabase, Tauri, raw fetch,
  // window.location, web storage, or import.meta.env.VITE_*) — those arrive via
  // @app/* seams (services/apiClient, auth/session, platform/openExternal, ...)
  // that each leaf provides for its own platform.
  {
    files: ["editor/src/cloud/**/*.{js,mjs,jsx,ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...baseRestrictedImportPatterns,
            {
              regex: "^@supabase/",
              message:
                "cloud/ must stay platform-portable. Reach Supabase via an @app/* seam (e.g. @app/auth/supabase, @app/auth/session) provided per-platform in saas/ and desktop/.",
            },
            {
              regex: "^@tauri-apps/",
              message:
                "cloud/ must stay platform-portable. Tauri APIs are desktop-only — reach native features via an @app/* seam (e.g. @app/platform/openExternal).",
            },
          ],
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
      "no-restricted-syntax": [
        "error",
        ...sharedComponentSyntaxRestrictions,
        {
          selector:
            "MemberExpression[object.name='window'][property.name='location']",
          message:
            "cloud/ must not touch window.location — use an @app/* seam (e.g. @app/platform/openExternal) so desktop/web can differ.",
        },
        {
          selector:
            "MemberExpression[property.name='env'][object.type='MetaProperty'][object.meta.name='import'][object.property.name='meta']",
          message:
            "cloud/ must not read import.meta.env — use @app/constants/app / @app/platform seams so config is supplied per-platform.",
        },
      ],
    },
  },
  // app code must use shared DS Button/SegmentedControl/Chip; cloud/ covered above.
  {
    files: ["editor/src/**/*.{js,mjs,jsx,ts,tsx}"],
    ignores: [
      "editor/src/cloud/**/*.{js,mjs,jsx,ts,tsx}", // covered by cloud/ block above
      "editor/src/core/ui/**/*.{js,mjs,jsx,ts,tsx}", // the shared DS itself — wraps Mantine/raw elements
      "**/*.stories.{js,mjs,jsx,ts,tsx}", // stories may demo Mantine directly
      "**/*.test.{js,mjs,jsx,ts,tsx}", // tests may use raw elements as fixtures
      "editor/src/prototypes/**/*.{js,mjs,jsx,ts,tsx}", // not shipped
    ],
    rules: {
      "no-restricted-syntax": ["error", ...sharedComponentSyntaxRestrictions],
    },
  },
  // Intentional exceptions: ARIA tablist tabs and sub-26px segmented header —
  // semantically not buttons; shared Button sizing can't represent them.
  // Do NOT add ordinary buttons here.
  {
    files: [
      "editor/src/core/components/shared/FileSelectorPicker.tsx",
      "editor/src/core/components/filesPage/FileManagerView.tsx",
      "editor/src/core/pages/HomePage.tsx",
    ],
    rules: {
      "no-restricted-syntax": "off",
    },
  },
  // TEMPORARY: the procurement feature was merged in from main and still uses
  // bespoke CSS-styled raw <button>s. Exempt ONLY the raw-<button> rule here —
  // the Mantine import bans stay in force so this feature can't regress to
  // Mantine's Button/Chip/SegmentedControl — and migrate these to the shared
  // Button in a follow-up PR. Do NOT add other folders to this block.
  {
    files: [
      "editor/src/portal/components/procurement/**/*.{js,mjs,jsx,ts,tsx}",
    ],
    rules: {
      "no-restricted-syntax": ["error", ...mantineComponentImportRestrictions],
    },
  },
  // TEMPORARY: the portal user-management / integrations surface predates the
  // button consolidation and uses bespoke CSS-styled raw <button>s (kebab
  // triggers, inline text-link actions) that the shared Button can't represent
  // without heavy overrides. Exempt ONLY the raw-<button> rule — the Mantine
  // import bans stay in force — and migrate these in a follow-up PR.
  {
    files: ["editor/src/portal/components/users/UsersDirectory.tsx"],
    rules: {
      "no-restricted-syntax": ["error", ...mantineComponentImportRestrictions],
    },
  },
  // TEMPORARY (same rationale as procurement above): the portal home hero +
  // install modal reuse the same bespoke CSS-styled raw <button> controls as the
  // procurement deal hero — status/invite/icon buttons, full-width checklist and
  // install-option rows, and link-style guide actions that the shared Button
  // can't represent. Exempt ONLY the raw-<button> rule; the Mantine import bans
  // stay. Migrate these alongside the procurement buttons.
  {
    files: [
      "editor/src/portal/components/EditorStatusCard.tsx",
      "editor/src/portal/components/SetupChecklist.tsx",
      "editor/src/portal/components/WelcomeBanner.tsx",
      "editor/src/portal/components/DownloadEditorModal.tsx",
    ],
    rules: {
      "no-restricted-syntax": ["error", ...mantineComponentImportRestrictions],
    },
  },
  // Stricter rules that not all sub-folders are conformant to yet.
  {
    files: srcGlobs,
    ignores: [
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
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
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
