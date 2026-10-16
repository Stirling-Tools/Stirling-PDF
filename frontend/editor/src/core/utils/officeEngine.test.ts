import { describe, test, expect } from "vitest";
import { usesOfficeEngine } from "@app/utils/convertUtils";
import { buildConvertFormData } from "@app/hooks/tools/convert/useConvertOperation";
import { defaultParameters } from "@app/hooks/tools/convert/useConvertParameters";

describe("Stirling Office Convert switch", () => {
  test("applies to Office conversions only", () => {
    expect(usesOfficeEngine("pdf", "docx")).toBe(true);
    expect(usesOfficeEngine("pdf", "pptx")).toBe(true);
    expect(usesOfficeEngine("pdf", "xlsx")).toBe(true);
    expect(usesOfficeEngine("docx", "pdf")).toBe(true);
    expect(usesOfficeEngine("html", "pdf")).toBe(false);
    expect(usesOfficeEngine("pdf", "png")).toBe(false);
  });

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
