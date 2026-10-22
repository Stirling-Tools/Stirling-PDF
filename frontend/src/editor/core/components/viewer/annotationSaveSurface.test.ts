import { describe, expect, it } from "vitest";
import { PdfAnnotationSubtype } from "@embedpdf/models";
import type { PdfAnnotationObject } from "@embedpdf/models";
import { surfacesAnnotationSaveUi } from "@app/components/viewer/annotationSaveSurface";

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

  it("surfaces the panel for a signature stamp", () => {
    expect(
      surfacesAnnotationSaveUi(
        annotation({ type: PdfAnnotationSubtype.STAMP }),
      ),
    ).toBe(true);
  });

  // Provenance read off the annotation is not trustworthy: an imported PDF can
  // carry this author string on a plain image stamp. Hiding the save affordance
  // for it would strand an unsaved edit, so the stamp surfaces it instead.
  it("surfaces the panel for a stamp claiming to be a signature", () => {
    expect(
      surfacesAnnotationSaveUi(
        annotation({
          type: PdfAnnotationSubtype.STAMP,
          author: "Digital Signature",
          subject: "Digital Signature",
        }),
      ),
    ).toBe(true);
  });

  it("still skips a redaction mark that carries a signature author", () => {
    expect(
      surfacesAnnotationSaveUi(
        annotation({
          type: PdfAnnotationSubtype.REDACT,
          author: "Digital Signature",
        }),
      ),
    ).toBe(false);
  });

  it("does nothing for an event without an annotation", () => {
    expect(surfacesAnnotationSaveUi(undefined)).toBe(false);
  });
});
