// @vitest-environment node
import { describe, expect, it } from "vitest";
import { FontCharset } from "@embedpdf/models";
import { FontFallbackManager, type FontEntry } from "@embedpdf/engines";
import { getLocalFontFallbackConfig } from "@editor/services/pdfiumFontFallback";

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

  // Exercises the local @embedpdf/engines patch; fails if an install skipped it.
  it("selects serif and monospace faces by name, then by PDFium's pitch flags", () => {
    const manager = new FontFallbackManager(getLocalFontFallbackConfig());
    const internals = manager as unknown as {
      mapFont(
        weight: number,
        italic: number,
        charset: number,
        pitchFamily: number,
        face: string,
      ): number;
      fontHandles: Map<number, { url: string }>;
    };
    const fileFor = (charset: number, pitchFamily: number, face: string) => {
      const handle = internals.mapFont(400, 0, charset, pitchFamily, face);
      return internals.fontHandles.get(handle)?.url.split("/").pop();
    };

    expect(fileFor(FontCharset.ANSI, 0, "Times-Roman")).toBe(
      "LiberationSerif-Regular.ttf",
    );
    expect(fileFor(FontCharset.ANSI, 0, "ABCDEF+CourierNewPSMT")).toBe(
      "LiberationMono-Regular.ttf",
    );
    expect(fileFor(FontCharset.ANSI, 0, "Helvetica")).toBe(
      "LiberationSans-Regular.ttf",
    );
    // Mono variants of sans families, and a sans face with a serif-like prefix.
    expect(fileFor(FontCharset.ANSI, 0, "NotoSansMono-Regular")).toBe(
      "LiberationMono-Regular.ttf",
    );
    expect(fileFor(FontCharset.ANSI, 0, "CenturyGothic")).toBe(
      "LiberationSans-Regular.ttf",
    );
    expect(fileFor(FontCharset.ANSI, 0, "Verdana")).toBe("DejaVuSans.ttf");
    expect(fileFor(FontCharset.ANSI, 0, "Tahoma")).toBe(
      "LiberationSans-Regular.ttf",
    );
    // Unknown names fall back to the serif (16) and fixed-pitch (1) flags.
    expect(fileFor(FontCharset.ANSI, 16, "HouseSerif")).toBe(
      "LiberationSerif-Regular.ttf",
    );
    expect(fileFor(FontCharset.EASTERNEUROPEAN, 1, "HouseMono")).toBe(
      "LiberationMono-Regular.ttf",
    );
    expect(fileFor(FontCharset.ANSI, 0, "HouseSans")).toBe(
      "LiberationSans-Regular.ttf",
    );
    // Non-Latin charsets keep their own faces whatever the flags say.
    expect(fileFor(FontCharset.ARABIC, 16, "Times-Roman")).toBe(
      "NotoSansArabic-Regular.ttf",
    );
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
