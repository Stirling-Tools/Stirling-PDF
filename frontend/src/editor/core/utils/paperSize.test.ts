import { describe, expect, it } from "vitest";
import {
  localPaperSize,
  orderPaperSizeOptions,
  paperFamilyOf,
  preferredPaperFamily,
} from "@editor/utils/paperSize";

describe("preferredPaperFamily", () => {
  it.each([
    [["en-US"], "northAmerican"],
    [["fr-CA"], "northAmerican"],
    [["es-MX"], "northAmerican"],
    [["en-GB"], "iso"],
    [["de-DE"], "iso"],
    [["en", "en-GB"], "iso"],
    [["en", "en-US"], "northAmerican"],
    [["de"], "iso"],
    [["en"], "northAmerican"],
    [[], "iso"],
    [["not a locale"], "iso"],
  ] as const)("%j -> %s", (locales, expected) => {
    expect(preferredPaperFamily(locales)).toBe(expected);
  });
});

describe("paperFamilyOf", () => {
  it.each([
    ["A4", "iso"],
    ["a3", "iso"],
    ["LETTER", "northAmerican"],
    ["letter", "northAmerican"],
    ["Tabloid", "northAmerican"],
    ["KEEP", undefined],
    ["CUSTOM", undefined],
  ] as const)("%s -> %s", (size, expected) => {
    expect(paperFamilyOf(size)).toBe(expected);
  });
});

describe("localPaperSize", () => {
  it("picks the spelling for the locale", () => {
    expect(localPaperSize("A4", "Letter", ["en-US"])).toBe("Letter");
    expect(localPaperSize("A4", "Letter", ["en-GB"])).toBe("A4");
  });
});

describe("orderPaperSizeOptions", () => {
  const options = ["KEEP", "A3", "A4", "LETTER", "LEGAL", "CUSTOM"].map(
    (value) => ({ value }),
  );
  const values = (locales: string[]) =>
    orderPaperSizeOptions(options, locales).map((option) => option.value);

  it("puts North American sizes first for a Letter locale, leaving other options in place", () => {
    expect(values(["en-US"])).toEqual([
      "KEEP",
      "LETTER",
      "LEGAL",
      "A3",
      "A4",
      "CUSTOM",
    ]);
  });

  it("puts ISO sizes first for an A4 locale", () => {
    expect(values(["en-GB"])).toEqual([
      "KEEP",
      "A3",
      "A4",
      "LETTER",
      "LEGAL",
      "CUSTOM",
    ]);
  });
});
