import { describe, expect, it } from "vitest";
import { PdfAnnotationSubtype } from "@embedpdf/models";
import {
  shouldAutoExitPlacement,
  type AutoExitPlacementParams,
} from "@app/components/viewer/signaturePlacement";

const params = (
  overrides: Partial<AutoExitPlacementParams> = {},
): AutoExitPlacementParams => ({
  annotation: { type: PdfAnnotationSubtype.STAMP },
  placeMultiple: false,
  autoExitEnabled: true,
  userPlaced: true,
  ...overrides,
});

describe("shouldAutoExitPlacement", () => {
  it("returns true for a user-placed stamp when placeMultiple is false", () => {
    expect(shouldAutoExitPlacement(params())).toBe(true);
  });

  it("returns false for a stamp annotation when placeMultiple is true", () => {
    expect(shouldAutoExitPlacement(params({ placeMultiple: true }))).toBe(
      false,
    );
  });

  it("returns false when the mounted tool has not opted in", () => {
    expect(shouldAutoExitPlacement(params({ autoExitEnabled: false }))).toBe(
      false,
    );
  });

  it("returns false for programmatic creates (paste, undo/redo restore)", () => {
    expect(shouldAutoExitPlacement(params({ userPlaced: false }))).toBe(false);
  });

  it("returns false for an ink-stroke annotation regardless of placeMultiple", () => {
    expect(
      shouldAutoExitPlacement(
        params({ annotation: { type: PdfAnnotationSubtype.INK } }),
      ),
    ).toBe(false);
    expect(
      shouldAutoExitPlacement(
        params({
          annotation: { type: PdfAnnotationSubtype.INK },
          placeMultiple: true,
        }),
      ),
    ).toBe(false);
  });

  it("falls back to annotation.object.type when annotation.type is missing", () => {
    expect(
      shouldAutoExitPlacement(
        params({
          annotation: { object: { type: PdfAnnotationSubtype.STAMP } },
        }),
      ),
    ).toBe(true);
  });

  it("returns false when neither annotation.type nor object.type is present", () => {
    expect(shouldAutoExitPlacement(params({ annotation: {} }))).toBe(false);
    expect(shouldAutoExitPlacement(params({ annotation: null }))).toBe(false);
    expect(shouldAutoExitPlacement(params({ annotation: undefined }))).toBe(
      false,
    );
  });

  it("returns false for FREETEXT, HIGHLIGHT, and other non-stamp types", () => {
    expect(
      shouldAutoExitPlacement(
        params({ annotation: { type: PdfAnnotationSubtype.FREETEXT } }),
      ),
    ).toBe(false);
    expect(
      shouldAutoExitPlacement(
        params({ annotation: { type: PdfAnnotationSubtype.HIGHLIGHT } }),
      ),
    ).toBe(false);
  });
});
