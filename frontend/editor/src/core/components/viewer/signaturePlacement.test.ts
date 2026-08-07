import { describe, expect, it } from "vitest";
import { PdfAnnotationSubtype } from "@embedpdf/models";
import { shouldAutoExitPlacement } from "@app/components/viewer/signaturePlacement";

describe("shouldAutoExitPlacement", () => {
  it("returns true for a stamp annotation when placeMultiple is false", () => {
    expect(
      shouldAutoExitPlacement({ type: PdfAnnotationSubtype.STAMP }, false),
    ).toBe(true);
  });

  it("returns false for a stamp annotation when placeMultiple is true", () => {
    expect(
      shouldAutoExitPlacement({ type: PdfAnnotationSubtype.STAMP }, true),
    ).toBe(false);
  });

  it("returns false for an ink-stroke annotation regardless of placeMultiple", () => {
    expect(
      shouldAutoExitPlacement({ type: PdfAnnotationSubtype.INK }, false),
    ).toBe(false);
    expect(
      shouldAutoExitPlacement({ type: PdfAnnotationSubtype.INK }, true),
    ).toBe(false);
  });

  it("falls back to annotation.object.type when annotation.type is missing", () => {
    expect(
      shouldAutoExitPlacement(
        { object: { type: PdfAnnotationSubtype.STAMP } },
        false,
      ),
    ).toBe(true);
  });

  it("returns false when neither annotation.type nor object.type is present", () => {
    expect(shouldAutoExitPlacement({}, false)).toBe(false);
    expect(shouldAutoExitPlacement(null, false)).toBe(false);
    expect(shouldAutoExitPlacement(undefined, false)).toBe(false);
  });

  it("returns false for FREETEXT, HIGHLIGHT, and other non-stamp types", () => {
    expect(
      shouldAutoExitPlacement({ type: PdfAnnotationSubtype.FREETEXT }, false),
    ).toBe(false);
    expect(
      shouldAutoExitPlacement({ type: PdfAnnotationSubtype.HIGHLIGHT }, false),
    ).toBe(false);
  });
});
