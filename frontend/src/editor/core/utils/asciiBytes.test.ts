import { describe, expect, it } from "vitest";
import { hasAcroForm } from "@app/utils/asciiBytes";

const bytes = (text: string) => new TextEncoder().encode(text);

describe("hasAcroForm", () => {
  it("matches a whole name token", () => {
    expect(hasAcroForm(bytes("<</AcroForm 1 0 R>>"))).toBe(true);
    expect(hasAcroForm(bytes("/AcroForm/Fields"))).toBe(true);
    expect(hasAcroForm(bytes("/AcroForm"))).toBe(true);
  });

  it("ignores a longer name that starts with the token", () => {
    expect(hasAcroForm(bytes("/AcroFormExtra"))).toBe(false);
    expect(hasAcroForm(bytes("/AcroForm2"))).toBe(false);
  });

  it("returns false when the token is absent", () => {
    expect(hasAcroForm(bytes("%PDF-1.7\n1 0 obj"))).toBe(false);
  });

  it("keys the memoised result by view offset and length", () => {
    const buffer = bytes("/AcroForm").buffer;
    const full = new Uint8Array(buffer);
    const tail = new Uint8Array(buffer, 1, 4);

    expect(hasAcroForm(full)).toBe(true);
    expect(hasAcroForm(tail)).toBe(false);
  });
});
