import { describe, expect, it } from "vitest";

import {
  detectDocumentLanguage,
  languageCodeFromTag,
  sampleTextForDetection,
} from "@app/services/languageDetection/documentLanguage";

describe("languageCodeFromTag", () => {
  it.each([
    ["en-GB", "en"],
    ["pt_BR", "pt"],
    ["de", "de"],
    ["zh-Hant-TW", "zh"],
  ])("narrows %s to %s", (tag, expected) => {
    expect(languageCodeFromTag(tag)).toBe(expected);
  });

  it.each([null, undefined, "", "und", "not a locale"])(
    "treats %s as absent",
    (tag) => {
      expect(languageCodeFromTag(tag)).toBeNull();
    },
  );
});

describe("sampleTextForDetection", () => {
  it("joins pages and caps the sample", () => {
    const sample = sampleTextForDetection([
      "a".repeat(15_000),
      "b".repeat(15_000),
    ]);
    expect(sample.length).toBeLessThanOrEqual(20_001);
    expect(sample.startsWith("a")).toBe(true);
  });

  it("returns an empty string when there is no text", () => {
    expect(sampleTextForDetection([])).toBe("");
  });
});

describe("detectDocumentLanguage", () => {
  it("prefers a valid PDF language tag over the text", () => {
    const result = detectDocumentLanguage(
      "This English text would otherwise be detected as English.",
      "es-ES",
    );
    expect(result.detection.language).toBe("es");
    expect(result.source).toBe("metadata");
    expect(result.tag).toBe("es-ES");
  });

  it("identifies text when the PDF has no tag", () => {
    const result = detectDocumentLanguage(
      "Este contrato de arrendamiento se celebra entre el arrendador y el " +
        "arrendatario para la vivienda situada en la ciudad. El arrendatario " +
        "pagará una renta mensual según las condiciones acordadas.",
    );
    expect(result.detection.language).toBe("es");
    expect(result.source).toBe("text");
  });

  it("reports no source when the sample carries no language", () => {
    const result = detectDocumentLanguage("12 34 56 78");
    expect(result.detection.language).toBeNull();
    expect(result.source).toBe("none");
  });
});
