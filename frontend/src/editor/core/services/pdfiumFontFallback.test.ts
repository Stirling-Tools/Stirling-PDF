// @vitest-environment node
import { describe, expect, it } from "vitest";
import { FontCharset } from "@embedpdf/models";
import type { FontEntry } from "@embedpdf/engines";
import { getLocalFontFallbackConfig } from "@app/services/pdfiumFontFallback";

const fontUrls = (entry: FontEntry | undefined): string[] =>
  entry === undefined
    ? []
    : typeof entry === "string"
      ? [entry]
      : (Array.isArray(entry) ? entry : [entry]).map((v) => v.url);

describe("pdfiumFontFallback", () => {
  it("generates a self-hosted font fallback configuration without external CDN URLs", () => {
    const config = getLocalFontFallbackConfig();

    expect(config.baseUrl).toContain("/fonts");
    expect(config.defaultFont).toBe("NotoSans-Regular.ttf");

    expect(config.fonts[FontCharset.VIETNAMESE]).toBe("NotoSans-Regular.ttf");
    expect(config.fonts[FontCharset.SHIFTJIS]).toBe("NotoSansJP-Regular.ttf");
    expect(config.fonts[FontCharset.HANGEUL]).toBe("NotoSansKR-Regular.ttf");
    expect(config.fonts[FontCharset.GB2312]).toBe("NotoSansSC-Regular.ttf");
    expect(config.fonts[FontCharset.CHINESEBIG5]).toBe(
      "NotoSansTC-Regular.ttf",
    );
    expect(config.fonts[FontCharset.ARABIC]).toBe("NotoSansArabic-Regular.ttf");
    expect(config.fonts[FontCharset.HEBREW]).toBe("NotoSansHebrew-Regular.ttf");
    expect(config.fonts[FontCharset.THAI]).toBe("NotoSansThai-Regular.ttf");

    expect(config.baseUrl).not.toContain("jsdelivr");
    for (const fontVal of Object.values(config.fonts)) {
      for (const url of fontUrls(fontVal)) {
        expect(url).not.toContain("http://");
        expect(url).not.toContain("https://");
        expect(url).not.toContain("jsdelivr");
      }
    }
  });

  it("draws Latin, Greek and Cyrillic with a face metric-compatible with Helvetica and Arial", () => {
    const config = getLocalFontFallbackConfig();

    for (const charset of [
      FontCharset.ANSI,
      FontCharset.DEFAULT,
      FontCharset.EASTERNEUROPEAN,
      FontCharset.GREEK,
      FontCharset.CYRILLIC,
    ]) {
      expect(config.fonts[charset]).toEqual([
        { url: "LiberationSans-Regular.ttf", weight: 400 },
        { url: "LiberationSans-Bold.ttf", weight: 700 },
        { url: "LiberationSans-Italic.ttf", weight: 400, italic: true },
        { url: "LiberationSans-BoldItalic.ttf", weight: 700, italic: true },
      ]);
    }
  });

  it("maps every charset with a face and leaves the rest to the default", () => {
    const config = getLocalFontFallbackConfig();

    // A numeric enum also exposes reverse mappings, so keep the names only.
    const charsets = Object.keys(FontCharset).filter((key) =>
      Number.isNaN(Number(key)),
    ) as (keyof typeof FontCharset)[];

    expect(config.baseUrl).toBeTruthy();
    expect(config.defaultFont).toBeTruthy();

    for (const name of charsets) {
      // Noto has no symbol face, so that charset must resolve via defaultFont.
      if (name === "SYMBOL") {
        expect(config.fonts[FontCharset[name]]).toBeUndefined();
        continue;
      }
      const urls = fontUrls(config.fonts[FontCharset[name]]);
      expect(urls.length).toBeGreaterThan(0);
      for (const url of urls) {
        expect(url).toMatch(/^(NotoSans|LiberationSans)[A-Za-z-]*\.ttf$/);
      }
    }
  });
});
