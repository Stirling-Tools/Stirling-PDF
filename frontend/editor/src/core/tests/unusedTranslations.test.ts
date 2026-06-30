import fs from "fs";
import path from "path";
import { describe, expect, test } from "vitest";
import {
  I18N_PROJECTS,
  REPO_ROOT,
  findUnusedKeys,
} from "@shared/i18n/translationAudit";

// One suite per frontend app (editor + portal). The scan logic lives in
// @shared/i18n/translationAudit so both apps share one implementation; each
// project carries its own ignoredKeyPatterns for runtime-assembled keys.
describe.each(I18N_PROJECTS)(
  "Unused translation coverage — $name",
  (project) => {
    test(
      "fails if any en-US key has no source references",
      { timeout: 30_000 },
      () => {
        expect(fs.existsSync(project.localeFile)).toBe(true);

        const { unused, localeCount } = findUnusedKeys(project);
        expect(localeCount).toBeGreaterThan(project.minLocaleKeys ?? 1); // sanity

        const localeRelative = path
          .relative(REPO_ROOT, project.localeFile)
          .replace(/\\/g, "/");

        // GitHub Annotations format so unused keys show up tagged on the locale.
        for (const key of unused) {
          process.stderr.write(
            `::error file=${localeRelative}::Unused en-US translation: ${key}\n`,
          );
        }

        expect(
          unused,
          `Found ${unused.length} unused en-US translation key(s). ` +
            `Remove them from ${localeRelative}, or (if the usage is too ` +
            `dynamic for the heuristic to spot) add a pattern to this ` +
            `project's ignoredKeyPatterns in @shared/i18n/translationAudit.`,
        ).toEqual([]);
      },
    );
  },
);
