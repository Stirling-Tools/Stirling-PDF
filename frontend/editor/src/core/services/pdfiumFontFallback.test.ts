import { describe, expect, it } from "vitest";
import { FontCharset } from "@embedpdf/models";
import { getLocalFontFallbackConfig } from "@app/services/pdfiumFontFallback";

describe("pdfiumFontFallback", () => {
  it("generates a self-hosted font fallback configuration without external CDN URLs", () => {
    const config = getLocalFontFallbackConfig();

    expect(config.baseUrl).toContain("/fonts");
    expect(config.defaultFont).toBe("NotoSans-Regular.ttf");

    expect(config.fonts[FontCharset.ANSI]).toBe("NotoSans-Regular.ttf");
    expect(config.fonts[FontCharset.DEFAULT]).toBe("NotoSans-Regular.ttf");
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
      expect(String(fontVal)).not.toContain("http://");
      expect(String(fontVal)).not.toContain("https://");
      expect(String(fontVal)).not.toContain("jsdelivr");
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
      expect(String(config.fonts[FontCharset[name]])).toMatch(
        /^NotoSans[A-Za-z-]*\.ttf$/,
      );
    }
  });
});
