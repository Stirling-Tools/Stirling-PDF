import { describe, expect, it } from "vitest";
import {
  deriveInitials,
  fitPlacedSignatureSize,
} from "@app/utils/signatureImage";

describe("deriveInitials", () => {
  it("takes the first letters of the first and last names", () => {
    expect(deriveInitials("Jordan Ellis")).toBe("JE");
    expect(deriveInitials("  mary   ann   lee ")).toBe("ML");
  });

  it("uses a single letter for a single name and nothing for blanks", () => {
    expect(deriveInitials("Cher")).toBe("C");
    expect(deriveInitials("   ")).toBe("");
  });
});

describe("fitPlacedSignatureSize", () => {
  it("fits a wide signature to the line width, keeping its aspect", () => {
    const size = fitPlacedSignatureSize(1200, 300);
    expect(size.width).toBeCloseTo(180);
    expect(size.height).toBeCloseTo(45);
  });

  it("fits a tall mark (initials, seals) to the line height", () => {
    const size = fitPlacedSignatureSize(200, 200);
    expect(size.width).toBeCloseTo(60);
    expect(size.height).toBeCloseTo(60);
  });

  it("scales a small image up to the same box", () => {
    const size = fitPlacedSignatureSize(36, 12);
    expect(size.width).toBeCloseTo(180);
    expect(size.height).toBeCloseTo(60);
  });

  it("survives zero dimensions", () => {
    const size = fitPlacedSignatureSize(0, 0);
    expect(Number.isFinite(size.width)).toBe(true);
    expect(Number.isFinite(size.height)).toBe(true);
  });
});
