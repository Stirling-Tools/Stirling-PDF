// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { TFunction } from "i18next";
import {
  findToolContentMatch,
  buildToolMatchSnippet,
  getTranslationPrefixesForToolId,
  normalizeSearchText,
} from "@editor/data/toolContentSearch";

describe("toolContentSearch", () => {
  it("normalizes text and treats colour and color equivalently", () => {
    expect(normalizeSearchText("Convert Colour Space")).toBe(
      "convert color space",
    );
    expect(normalizeSearchText("Replace & Invert Color")).toBe(
      "replace & invert color",
    );
  });

  it("returns additional prefixes for tools with split or legacy translations", () => {
    const splitPrefixes = getTranslationPrefixesForToolId("split");
    expect(splitPrefixes).toContain("split");
    expect(splitPrefixes).toContain("home.split");
    expect(splitPrefixes).toContain("autoSplitPDF");

    const replaceColorPrefixes =
      getTranslationPrefixesForToolId("replaceColor");
    expect(replaceColorPrefixes).toContain("replaceColor");
    expect(replaceColorPrefixes).toContain("home.replaceColor");
    expect(replaceColorPrefixes).toContain("replace-color");
  });

  it("finds matches in tool content and builds appropriate snippets", () => {
    const mockT = ((key: string) => {
      if (key === "replaceColor") {
        return {
          options: {
            cmyk: "Convert to CMYK",
            highContrast: "High contrast color options",
          },
          tooltip: {
            cmyk: {
              text: "Convert the PDF from RGB color space to CMYK color space, optimized for professional printing.",
            },
          },
        };
      }
      return {};
    }) as unknown as TFunction;

    const matchCmyk = findToolContentMatch("replaceColor", "CMYK", mockT);
    expect(matchCmyk).toBeTruthy();
    expect(matchCmyk).toContain("CMYK");

    const snippetCmyk = buildToolMatchSnippet(matchCmyk!, "CMYK");
    expect(snippetCmyk).toContain("CMYK");

    const matchColourConvert = findToolContentMatch(
      "replaceColor",
      "colour convert",
      mockT,
    );
    expect(matchColourConvert).toBeTruthy();

    const snippetColourConvert = buildToolMatchSnippet(
      matchColourConvert!,
      "colour convert",
    );
    expect(snippetColourConvert).toContain("Convert");

    expect(
      findToolContentMatch("replaceColor", "nonexistentfeature", mockT),
    ).toBe(null);
  });
});
