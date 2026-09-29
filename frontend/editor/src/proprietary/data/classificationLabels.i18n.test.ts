import fs from "fs";
import path from "path";
import { describe, it, expect } from "vitest";
import { parse } from "smol-toml";
import {
  DEFAULT_CLASSIFICATION_LABELS,
  LABEL_FAMILIES,
} from "@app/data/classificationLabels";

// Label and family names are rendered through `classification.labels.<id>` /
// `classification.families.<id>`, with the built-in English name as the fallback.
// A fallback renders fine but is never translated (and logs a missingKey), so a
// label added to classificationLabels.json without its en-US key silently ships
// English to every locale. This guards that the en-US vocabulary stays complete.

const EN_US_TRANSLATIONS = path.join(
  __dirname,
  "../../../public/locales/en-US/translation.toml",
);

function readSection(section: string): Record<string, unknown> {
  const parsed = parse(fs.readFileSync(EN_US_TRANSLATIONS, "utf8")) as {
    classification?: Record<string, Record<string, unknown>>;
  };
  return parsed.classification?.[section] ?? {};
}

describe("classification vocabulary (en-US coverage)", () => {
  const labels = readSection("labels");
  const families = readSection("families");

  it("has an en-US key for every label id, matching its built-in name", () => {
    for (const label of DEFAULT_CLASSIFICATION_LABELS) {
      expect(
        labels[label.id],
        `en-US missing classification.labels.${label.id}`,
      ).toBe(label.name);
    }
  });

  it("has an en-US key for every family id, matching its built-in name", () => {
    for (const family of LABEL_FAMILIES) {
      expect(
        families[family.id],
        `en-US missing classification.families.${family.id}`,
      ).toBe(family.name);
    }
  });

  it("has no en-US keys for labels or families that no longer exist", () => {
    const labelIds = new Set(DEFAULT_CLASSIFICATION_LABELS.map((l) => l.id));
    const familyIds = new Set(LABEL_FAMILIES.map((f) => f.id));
    expect(Object.keys(labels).filter((id) => !labelIds.has(id))).toEqual([]);
    expect(Object.keys(families).filter((id) => !familyIds.has(id))).toEqual(
      [],
    );
  });
});
