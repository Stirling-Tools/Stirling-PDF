import fs from "fs";
import path from "path";
import { describe, expect, test } from "vitest";
import {
  I18N_PROJECTS,
  REPO_ROOT,
  findMissingKeys,
} from "@shared/i18n/translationAudit";

// One suite per frontend app (editor + portal). The scan logic lives in
// @shared/i18n/translationAudit so both apps share one implementation.
describe.each(I18N_PROJECTS)(
  "Missing translation coverage — $name",
  (project) => {
    test(
      "fails if any en-US key used in source is missing from the locale",
      { timeout: 10000 },
      () => {
        expect(fs.existsSync(project.localeFile)).toBe(true);

        const { missing, usedCount } = findMissingKeys(project);
        expect(usedCount).toBeGreaterThan(project.minUsedKeys ?? 1); // scan sanity

        const annotations = missing.map(
          ({ key, fallback, file, line, column }) => ({
            key,
            fallback,
            file: path.relative(REPO_ROOT, file).replace(/\\/g, "/"),
            line,
            column,
          }),
        );

        // GitHub Annotations format so misses show up tagged on the code in CI.
        for (const { key, fallback, file, line, column } of annotations) {
          process.stderr.write(
            `::error file=${file},line=${line},col=${column}::Missing en-US translation for ${key} (${fallback})\n`,
          );
        }

        const located = annotations.map(
          ({ key, fallback, file, line, column }) => ({
            key,
            fallback,
            location: `${file}:${line}:${column}`,
          }),
        );

        expect(located).toEqual([]);
      },
    );
  },
);
