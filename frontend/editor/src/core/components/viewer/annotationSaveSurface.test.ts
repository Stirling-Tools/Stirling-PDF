import { describe, expect, it } from "vitest";
import { PdfAnnotationSubtype } from "@embedpdf/models";
import type { PdfAnnotationObject } from "@embedpdf/models";
import { surfacesAnnotationSaveUi } from "@app/components/viewer/annotationSaveSurface";
import { SIGNATURE_ANNOTATION_AUTHOR } from "@app/constants/app";

function annotation(
  over: Partial<PdfAnnotationObject> & Pick<PdfAnnotationObject, "type">,
): PdfAnnotationObject {
  return {
    id: "a1",
    pageIndex: 0,
    rect: { origin: { x: 0, y: 0 }, size: { width: 10, height: 10 } },
    ...over,
  } as PdfAnnotationObject;
}

describe("surfacesAnnotationSaveUi", () => {
  it("surfaces the panel for an ordinary annotation", () => {
    expect(
      surfacesAnnotationSaveUi(annotation({ type: PdfAnnotationSubtype.TEXT })),
    ).toBe(true);
  });

  it("skips redaction marks, which the redaction flow applies", () => {
    expect(
      surfacesAnnotationSaveUi(
        annotation({ type: PdfAnnotationSubtype.REDACT }),
      ),
    ).toBe(false);
  });

  it("skips a signature stamp", () => {
    expect(
      surfacesAnnotationSaveUi(
        annotation({
          type: PdfAnnotationSubtype.STAMP,
          author: SIGNATURE_ANNOTATION_AUTHOR,
        }),
      ),
    ).toBe(false);
  });

  // The bug this guards: excluding every STAMP left an image stamp the user
  // moved or deleted with no visible save affordance.
  it("surfaces the panel for a pre-existing image stamp", () => {
    expect(
      surfacesAnnotationSaveUi(
        annotation({ type: PdfAnnotationSubtype.STAMP }),
      ),
    ).toBe(true);
  });

  it("treats a stamp authored by someone else as an ordinary annotation", () => {
    expect(
      surfacesAnnotationSaveUi(
        annotation({
          type: PdfAnnotationSubtype.STAMP,
          author: "A. Auditor",
        }),
      ),
    ).toBe(true);
  });

  it("does nothing for an event without an annotation", () => {
    expect(surfacesAnnotationSaveUi(undefined)).toBe(false);
  });
});
