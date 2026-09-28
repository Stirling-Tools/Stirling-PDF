import { describe, it, expect } from "vitest";
import { helveticaVariantFor } from "@app/tools/pdfTextEditor/util/helveticaVariant";

// The base-14 fallback used to map EVERY source font to a Helvetica variant.
describe("helveticaVariantFor", () => {
  it("keeps sans-serif sources on Helvetica with canonical styles", () => {
    expect(helveticaVariantFor("ABCDEF+Arial")).toBe("Helvetica");
    expect(helveticaVariantFor("Arial-BoldMT")).toBe("Helvetica-Bold");
    expect(helveticaVariantFor("Verdana-Italic")).toBe("Helvetica-Oblique");
    expect(helveticaVariantFor("Helvetica-BoldOblique")).toBe(
      "Helvetica-BoldOblique",
    );
  });

  it("maps serif sources (incl. LaTeX Computer Modern) to Times", () => {
    expect(helveticaVariantFor("ABCDEF+LMRoman12-Regular")).toBe("Times-Roman");
    expect(helveticaVariantFor("Times New Roman")).toBe("Times-Roman");
    expect(helveticaVariantFor("CMR10")).toBe("Times-Roman");
    expect(helveticaVariantFor("Georgia-BoldItalic")).toBe("Times-BoldItalic");
    expect(helveticaVariantFor("Garamond-Italic")).toBe("Times-Italic");
    expect(helveticaVariantFor("MinionPro-Bold")).toBe("Times-Bold");
  });

  it("maps monospace sources to Courier", () => {
    expect(helveticaVariantFor("Consolas")).toBe("Courier");
    expect(helveticaVariantFor("ABCDEF+CourierNew")).toBe("Courier");
    expect(helveticaVariantFor("DejaVuSansMono-Bold")).toBe("Courier-Bold");
    expect(helveticaVariantFor("MonoFont-Oblique")).toBe("Courier-Oblique");
    expect(helveticaVariantFor("SomethingMono-BoldItalic")).toBe(
      "Courier-BoldOblique",
    );
  });

  it("monospace classification wins over an incidental serif keyword", () => {
    // "Courier" is monospace even though it could read as a serif face.
    expect(helveticaVariantFor("CourierBold")).toBe("Courier-Bold");
  });
});

describe("device fonts survive an edit", () => {
  it("keeps the embedded family instead of mapping it to base-14", () => {
    expect(helveticaVariantFor("device:Segoe UI")).toBe("Segoe UI");
    expect(helveticaVariantFor("device:Georgia Bold")).toBe("Georgia Bold");
  });

  it("still maps a non-device id by its style class", () => {
    expect(helveticaVariantFor("pdf:12:ArialBold")).toBe("Helvetica-Bold");
    expect(helveticaVariantFor("base14:Times-Roman")).toBe("Times-Roman");
  });
});
