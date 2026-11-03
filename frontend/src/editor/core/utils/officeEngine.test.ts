import { describe, test, expect } from "vitest";
import { usesOfficeEngine } from "@editor/utils/convertUtils";
import { buildConvertFormData } from "@editor/hooks/tools/convert/useConvertOperation";
import { defaultParameters } from "@editor/hooks/tools/convert/useConvertParameters";

describe("Stirling Office Convert switch", () => {
  test("applies to supported document conversions", () => {
    expect(usesOfficeEngine("pdf", "docx")).toBe(true);
    expect(usesOfficeEngine("pdf", "pptx")).toBe(true);
    expect(usesOfficeEngine("pdf", "xlsx")).toBe(true);
    expect(usesOfficeEngine("docx", "pdf")).toBe(true);
    expect(usesOfficeEngine("html", "pdf")).toBe(true);
    expect(usesOfficeEngine("pdf", "md")).toBe(true);
    expect(usesOfficeEngine("pdf", "xml")).toBe(true);
    expect(usesOfficeEngine("pdf", "html")).toBe(true);
    expect(usesOfficeEngine("pdf", "pdfa")).toBe(true);
    expect(usesOfficeEngine("pdf", "epub")).toBe(true);
    expect(usesOfficeEngine("pdf", "azw3")).toBe(true);
    expect(usesOfficeEngine("epub", "pdf")).toBe(true);
    expect(usesOfficeEngine("file-vsdx", "pdf")).toBe(true);
    expect(usesOfficeEngine("file-htmlz", "pdf")).toBe(true);
    expect(usesOfficeEngine("eml", "pdf")).toBe(false);
    expect(usesOfficeEngine("pdf", "pdfx")).toBe(false);
    expect(usesOfficeEngine("pdf", "png")).toBe(false);
  });

  test.each([
    ["pdf", "docx"],
    ["pdf", "pptx"],
    ["pdf", "xlsx"],
    ["pdf", "txt"],
    ["pdf", "rtf"],
    ["pdf", "md"],
    ["pdf", "xml"],
    ["pdf", "html"],
    ["pdf", "pdfa"],
    ["pdf", "epub"],
    ["pdf", "azw3"],
    ["html", "pdf"],
    ["zip", "pdf"],
    ["md", "pdf"],
    ["epub", "pdf"],
    ["mobi", "pdf"],
    ["azw3", "pdf"],
    ["fb2", "pdf"],
    ["file-vsdx", "pdf"],
  ])(
    "serializes both engine choices for %s to %s",
    (fromExtension, toExtension) => {
      const file = new File(["x"], `input.${fromExtension}`);
      for (const choice of [true, false]) {
        const data = buildConvertFormData(
          {
            ...defaultParameters,
            fromExtension,
            toExtension,
            useStirlingOfficeConvert: choice,
          },
          [file],
        );
        expect(data.get("useStirlingOfficeConvert")).toBe(String(choice));
      }
    },
  );

  test("sends the choice only when one was made", () => {
    const file = new File(["x"], "a.pdf", { type: "application/pdf" });
    const base = {
      ...defaultParameters,
      fromExtension: "pdf",
      toExtension: "docx",
    };
    expect(
      buildConvertFormData(base, [file]).has("useStirlingOfficeConvert"),
    ).toBe(false);
    const chosen = buildConvertFormData(
      { ...base, useStirlingOfficeConvert: true },
      [file],
    );
    expect(chosen.get("useStirlingOfficeConvert")).toBe("true");
    const image = {
      ...base,
      toExtension: "png",
      useStirlingOfficeConvert: true,
    };
    expect(
      buildConvertFormData(image, [file]).has("useStirlingOfficeConvert"),
    ).toBe(false);
  });
});
