import { describe, expect, it } from "vitest";
import type { AnnotationEvent } from "@embedpdf/plugin-annotation";
import {
  PdfAnnotationSubtype,
  type PdfAnnotationObject,
} from "@embedpdf/models";
import { nextPlacedSignatures } from "@app/components/viewer/hooks/usePlacedSignatureTracking";

const stamp = (id: string, subject = "Digital Signature - Document signing") =>
  ({
    id,
    type: PdfAnnotationSubtype.STAMP,
    subject,
    pageIndex: 0,
  }) as PdfAnnotationObject;

const event = (
  type: "create" | "delete",
  annotation: PdfAnnotationObject,
  pageIndex = 0,
): AnnotationEvent =>
  ({
    type,
    documentId: "doc",
    annotation,
    pageIndex,
    committed: true,
  }) as AnnotationEvent;

const imageFor = (id: string) => `data:image/png;base64,${id}`;

describe("nextPlacedSignatures", () => {
  it("adds a created signature stamp with its stored image", () => {
    expect(
      nextPlacedSignatures([], event("create", stamp("a"), 2), imageFor),
    ).toEqual([{ id: "a", pageIndex: 2, imageSrc: imageFor("a") }]);
  });

  it("ignores stamps the sign tool did not make", () => {
    const placed = nextPlacedSignatures(
      [],
      event("create", stamp("a", "Approved")),
      imageFor,
    );
    expect(placed).toEqual([]);
  });

  it("drops a deleted signature, as undo does", () => {
    const placed = nextPlacedSignatures(
      [],
      event("create", stamp("a")),
      imageFor,
    );
    expect(
      nextPlacedSignatures(placed, event("delete", stamp("a")), imageFor),
    ).toEqual([]);
  });

  it("does not list a re-created signature twice", () => {
    const placed = nextPlacedSignatures(
      [],
      event("create", stamp("a")),
      imageFor,
    );
    expect(
      nextPlacedSignatures(placed, event("create", stamp("a")), imageFor),
    ).toBe(placed);
  });

  it("clears the list when another document loads", () => {
    const placed = nextPlacedSignatures(
      [],
      event("create", stamp("a")),
      imageFor,
    );
    const loaded = {
      type: "loaded",
      documentId: "doc",
      total: 0,
    } as AnnotationEvent;
    expect(nextPlacedSignatures(placed, loaded, imageFor)).toEqual([]);
  });
});
