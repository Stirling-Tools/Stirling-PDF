// @ts-check

import eslint from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

const srcGlobs = [
  // The portal layers live under src/processor/proprietary (base) and
  // src/processor/saas (saas override), so src/** covers them.
  "src/**/*.{js,mjs,jsx,ts,tsx}",
];
const nodeGlobs = [
  "scripts/**/*.{js,ts,mjs,mts}",
  "scripts/**/*.{js,ts,mjs,mts}",
  // Covers editor/vite.config.ts and editor/vitest.config.ts.
  "*.config.{js,ts,mjs}",
  "*.config.{js,ts,mjs}",
  ".storybook/*.{js,ts,mjs,mts,tsx}",
];

const baseRestrictedImportPatterns = [
  {
    regex: "^\\.",
    message:
      "Use a workspace alias (@editor/* for editor, @processor/* for portal) instead of relative imports.",
  },
  {
    regex: "^src/",
    message: "Use a workspace alias instead of absolute src/ imports.",
  },
];

// Button/SegmentedControl/Chip must come from the shared DS (@editor/ui), not Mantine.
// If no variant fits, extend @editor/ui — that layer (src/editor/core/ui) is exempt below.
const mantineComponentImportRestrictions = [
  {
    selector:
      "ImportDeclaration[source.value='@mantine/core'] > ImportSpecifier[imported.name=/^(Button|ActionIcon|UnstyledButton|CloseButton|FileButton)$/]",
    message:
      'Use the shared Button (@editor/ui/Button) instead of the Mantine button family. variant=primary|secondary|tertiary, accent=default|neutral|brand|ai|premium|danger|success|warning; an icon-only button is `<Button leftSection={…} aria-label="…" />`. If no variant fits, extend the shared Button rather than importing Mantine.',
  },
  {
    selector:
      "ImportDeclaration[source.value='@mantine/core'] > ImportSpecifier[imported.name='SegmentedControl']",
    message:
      "Use the shared SegmentedControl (@editor/ui/SegmentedControl) instead of Mantine's.",
  },
  {
    selector:
      "ImportDeclaration[source.value='@mantine/core'] > ImportSpecifier[imported.name=/^(Chip|Pill)$/]",
    message:
      "Use the shared Chip (@editor/ui/Chip) instead of Mantine's Chip/Pill.",
  },
];

// Raw <button> should be a shared Button too — but bespoke CSS-styled controls
// (tabs, nav rows, preset chips) can be exempted from this selector alone.
const rawButtonSyntaxRestriction = {
  selector: "JSXOpeningElement[name.name='button']",
  message:
    "Use the shared Button (@editor/ui/Button) instead of a raw <button> element. If no variant fits, extend the shared Button.",
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
      "dist",
      "public",
      "src-tauri",
      "playwright-report",
      "test-results",
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
  // Use the stub/shadow pattern instead: define a stub in src/editor/core/ and override in src/editor/desktop/.
  {
    files: srcGlobs,
    ignores: ["src/editor/desktop/**"],
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
  // @editor/* seams (services/apiClient, auth/session, platform/openExternal, ...)
  // that each leaf provides for its own platform.
  {
    files: ["src/editor/cloud/**/*.{js,mjs,jsx,ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...baseRestrictedImportPatterns,
            {
              regex: "^@supabase/",
              message:
                "cloud/ must stay platform-portable. Reach Supabase via an @editor/* seam (e.g. @editor/auth/supabase, @editor/auth/session) provided per-platform in saas/ and desktop/.",
            },
            {
              regex: "^@tauri-apps/",
              message:
                "cloud/ must stay platform-portable. Tauri APIs are desktop-only — reach native features via an @editor/* seam (e.g. @editor/platform/openExternal).",
            },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        {
          name: "fetch",
          message:
            "cloud/ must not call raw fetch — use @editor/services/apiClient so each platform supplies its own transport.",
        },
        {
          name: "localStorage",
          message:
            "cloud/ must not touch localStorage — use an @editor/* storage seam so desktop/web can differ.",
        },
        {
          name: "sessionStorage",
          message:
            "cloud/ must not touch sessionStorage — use an @editor/* storage seam so desktop/web can differ.",
        },
      ],
      "no-restricted-syntax": [
        "error",
        ...sharedComponentSyntaxRestrictions,
        {
          selector:
            "MemberExpression[object.name='window'][property.name='location']",
          message:
            "cloud/ must not touch window.location — use an @editor/* seam (e.g. @editor/platform/openExternal) so desktop/web can differ.",
        },
        {
          selector:
            "MemberExpression[property.name='env'][object.type='MetaProperty'][object.meta.name='import'][object.property.name='meta']",
          message:
            "cloud/ must not read import.meta.env — use @editor/constants/app / @editor/platform seams so config is supplied per-platform.",
        },
      ],
    },
  },
  // app code must use shared DS Button/SegmentedControl/Chip; cloud/ covered above.
  {
    files: ["src/**/*.{js,mjs,jsx,ts,tsx}"],
    ignores: [
      "src/editor/cloud/**/*.{js,mjs,jsx,ts,tsx}", // covered by cloud/ block above
      "src/editor/core/ui/**/*.{js,mjs,jsx,ts,tsx}", // the shared DS itself — wraps Mantine/raw elements
      "**/*.stories.{js,mjs,jsx,ts,tsx}", // stories may demo Mantine directly
      "**/*.test.{js,mjs,jsx,ts,tsx}", // tests may use raw elements as fixtures
      "src/editor/prototypes/**/*.{js,mjs,jsx,ts,tsx}", // not shipped
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
      "src/editor/core/components/shared/FileSelectorPicker.tsx",
      "src/editor/core/components/filesPage/FileManagerView.tsx",
      "src/editor/core/pages/HomePage.tsx",
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
      "src/processor/proprietary/components/procurement/**/*.{js,mjs,jsx,ts,tsx}",
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
    files: ["src/processor/proprietary/components/users/UsersDirectory.tsx"],
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
      "src/processor/proprietary/components/EditorStatusCard.tsx",
      "src/processor/proprietary/components/SetupChecklist.tsx",
      "src/processor/proprietary/components/WelcomeBanner.tsx",
      "src/processor/proprietary/components/DownloadEditorModal.tsx",
    ],
    rules: {
      "no-restricted-syntax": ["error", ...mantineComponentImportRestrictions],
    },
  },
  // Stricter rules that not all sub-folders are conformant to yet.
  {
    files: srcGlobs,
    ignores: [
      "src/editor/core/components/annotation/**/*.{js,mjs,jsx,ts,tsx}",
      "src/editor/core/components/pageEditor/*.{js,mjs,jsx,ts,tsx}",
      "src/editor/core/components/pageEditor/commands/*.{js,mjs,jsx,ts,tsx}",
      "src/editor/core/components/pageEditor/hooks/*.{js,mjs,jsx,ts,tsx}",
      "src/editor/core/components/shared/*.{js,mjs,jsx,ts,tsx}",
      "src/editor/core/components/shared/config/*.{js,mjs,jsx,ts,tsx}",
      "src/editor/core/components/shared/config/configSections/*.{js,mjs,jsx,ts,tsx}",
      "src/editor/core/components/shared/pageEditor/*.{js,mjs,jsx,ts,tsx}",
      "src/editor/core/components/tools/*.{js,mjs,jsx,ts,tsx}",
      "src/editor/core/components/tools/addStamp/*.{js,mjs,jsx,ts,tsx}",
      "src/editor/core/components/tools/automate/*.{js,mjs,jsx,ts,tsx}",
      "src/editor/core/components/tools/bookletImposition/*.{js,mjs,jsx,ts,tsx}",
      "src/editor/core/components/tools/certSign/*.{js,mjs,jsx,ts,tsx}",
      "src/editor/core/components/tools/pdfTextEditor/*.{js,mjs,jsx,ts,tsx}",
      "src/editor/core/components/tools/shared/*.{js,mjs,jsx,ts,tsx}",
      "src/editor/core/components/viewer/*.{js,mjs,jsx,ts,tsx}",
      "src/editor/core/contexts/*.{js,mjs,jsx,ts,tsx}",
      "src/editor/core/contexts/file/*.{js,mjs,jsx,ts,tsx}",
      "src/editor/core/contexts/viewer/*.{js,mjs,jsx,ts,tsx}",
      "src/editor/core/hooks/*.{js,mjs,jsx,ts,tsx}",
      "src/editor/core/hooks/signing/*.{js,mjs,jsx,ts,tsx}",
      "src/editor/core/hooks/tools/adjustContrast/*.{js,mjs,jsx,ts,tsx}",
      "src/editor/core/hooks/tools/convert/*.{js,mjs,jsx,ts,tsx}",
      "src/editor/core/hooks/tools/removePassword/*.{js,mjs,jsx,ts,tsx}",
      "src/editor/core/hooks/tools/shared/*.{js,mjs,jsx,ts,tsx}",
      "src/editor/core/services/*.{js,mjs,jsx,ts,tsx}",
      "src/editor/core/tools/annotate/useAnnotationSelection.ts",
      "src/editor/core/types/*.{js,mjs,jsx,ts,tsx}",
      "src/editor/core/utils/*.{js,mjs,jsx,ts,tsx}",
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
