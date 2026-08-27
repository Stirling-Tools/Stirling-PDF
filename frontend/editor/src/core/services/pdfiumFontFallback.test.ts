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
    expect(config.fonts[FontCharset.THAI]).toBe("NotoSansThai-Regular.ttf");

    expect(config.baseUrl).not.toContain("jsdelivr");
    for (const fontVal of Object.values(config.fonts)) {
      expect(String(fontVal)).not.toContain("http://");
      expect(String(fontVal)).not.toContain("https://");
      expect(String(fontVal)).not.toContain("jsdelivr");
    }
  });
});
