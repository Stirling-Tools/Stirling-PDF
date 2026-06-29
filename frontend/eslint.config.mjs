// @ts-check

import eslint from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

const srcGlobs = [
  "editor/src/**/*.{js,mjs,jsx,ts,tsx}",
  "portal/src/**/*.{js,mjs,jsx,ts,tsx}",
  "portal/main.tsx",
  "shared/**/*.{js,mjs,jsx,ts,tsx}",
];
const nodeGlobs = [
  "scripts/**/*.{js,ts,mjs,mts}",
  "editor/scripts/**/*.{js,ts,mjs,mts}",
  "portal/scripts/**/*.{js,ts,mjs,mts}",
  "editor/*.config.{js,ts,mjs}",
  "portal/*.config.{js,ts,mjs}",
  "*.config.{js,ts,mjs}",
  ".storybook/*.{js,ts,mjs,mts,tsx}",
];

const baseRestrictedImportPatterns = [
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
      "portal/public",
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
      "@typescript-eslint/no-require-imports": "off", // Temporarily disabled until codebase conformant
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
  // The shared/ layer is the seed of a future packages/shared-ui — it must
  // only depend on third-party packages and on itself. If it ever imports
  // from editor or portal layers, extraction to a standalone package later
  // becomes a rewrite instead of a `git mv`.
  {
    files: ["shared/**/*.{js,mjs,jsx,ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...baseRestrictedImportPatterns,
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
            {
              regex: "^@core/",
              message: "shared/ must not depend on editor/src/core/.",
            },
            {
              regex: "^@proprietary/",
              message: "shared/ must not depend on editor/src/proprietary/.",
            },
            {
              regex: "^@tauri-apps/",
              message: "shared/ must remain web-compatible (no Tauri APIs).",
            },
          ],
        },
      ],
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
