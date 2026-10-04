import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { AnnotationEvent } from "@embedpdf/plugin-annotation";
import {
  PdfAnnotationSubtype,
  type PdfAnnotationObject,
} from "@embedpdf/models";
import {
  nextPlacedSignatures,
  usePlacedSignatureTracking,
} from "@app/components/viewer/hooks/usePlacedSignatureTracking";

const tracking = vi.hoisted(() => ({
  api: { forDocument: vi.fn() },
  documentId: "doc",
  ready: true,
  setPlaced: vi.fn(),
  imageFor: vi.fn((id: string) => `data:image/png;base64,${id}`),
}));
vi.mock("@embedpdf/plugin-annotation/react", () => ({
  useAnnotationCapability: () => ({ provides: tracking.api }),
}));
vi.mock("@app/contexts/SignatureContext", () => ({
  useSignature: () => ({
    setPlacedSignatures: tracking.setPlaced,
    getImageData: tracking.imageFor,
  }),
}));
vi.mock("@app/components/viewer/hooks/useDocumentReady", () => ({
  useDocumentReady: () => tracking.ready,
}));
vi.mock("@app/components/viewer/useActiveDocumentId", () => ({
  useActiveDocumentId: () => tracking.documentId,
}));

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
): AnnotationEvent => ({
  type,
  documentId: "doc",
  annotation,
  pageIndex,
  committed: true,
});

describe("usePlacedSignatureTracking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tracking.documentId = "doc";
    tracking.ready = true;
  });

  it("enumerates existing stamps even if loading finished before subscription", () => {
    let notify: ((event: AnnotationEvent) => void) | undefined;
    const applied = stamp("applied");
    applied.flags = ["print", "readOnly", "locked"];
    const getAnnotations = vi.fn(() => [
      { commitState: "synced", object: stamp("saved") },
      { commitState: "synced", object: applied },
      { commitState: "deleted", object: stamp("deleted") },
      { commitState: "synced", object: stamp("other", "Approved") },
    ]);
    tracking.api.forDocument.mockReturnValue({
      getAnnotations,
      onAnnotationEvent: vi.fn((listener: (event: AnnotationEvent) => void) => {
        notify = listener;
        return vi.fn();
      }),
    });
    renderHook(() => usePlacedSignatureTracking());
    expect(tracking.setPlaced).toHaveBeenLastCalledWith([
      { id: "saved", pageIndex: 0, imageSrc: imageFor("saved") },
    ]);
    getAnnotations.mockReturnValue([
      { commitState: "synced", object: stamp("restored") },
    ]);
    act(() => notify?.({ type: "loaded", documentId: "doc", total: 1 }));
    expect(tracking.setPlaced).toHaveBeenLastCalledWith([
      { id: "restored", pageIndex: 0, imageSrc: imageFor("restored") },
    ]);
  });

  it("clears the old document's list and unsubscribes when it stops being ready", () => {
    const unsubscribe = vi.fn();
    tracking.api.forDocument.mockReturnValue({
      getAnnotations: () => [{ commitState: "synced", object: stamp("saved") }],
      onAnnotationEvent: () => unsubscribe,
    });
    const { rerender } = renderHook(() => usePlacedSignatureTracking());
    tracking.ready = false;
    rerender();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(tracking.setPlaced).toHaveBeenLastCalledWith([]);
  });
});

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

  it("does not offer applied signatures for placement or removal", () => {
    const applied = stamp("applied");
    applied.flags = ["print", "readOnly", "locked"];
    expect(
      nextPlacedSignatures([], event("create", applied), imageFor),
    ).toEqual([]);
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
