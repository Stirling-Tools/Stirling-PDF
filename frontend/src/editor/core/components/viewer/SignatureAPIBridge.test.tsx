import { act, createRef } from "react";
import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PdfAnnotationSubtype } from "@embedpdf/models";
import { SignatureAPIBridge } from "@editor/components/viewer/SignatureAPIBridge";
import type { SignatureAPI } from "@editor/components/viewer/viewerTypes";

const mocks = vi.hoisted(() => {
  let annotationListener: ((event: unknown) => void) | undefined;
  let activeTool: { id: string } | null = null;
  const annotationApi = {
    setActiveTool: vi.fn((id: string | null) => {
      activeTool = id ? { id } : null;
    }),
    getActiveTool: vi.fn(() => activeTool),
    setToolDefaults: vi.fn(),
    onAnnotationEvent: vi.fn((listener: (event: unknown) => void) => {
      annotationListener = listener;
      return vi.fn();
    }),
  };

  return {
    annotationApi,
    emitAnnotation: (event: unknown) => annotationListener?.(event),
    resetActiveTool: () => {
      activeTool = null;
    },
    signature: {
      signatureConfig: {
        signatureType: "image" as const,
        signatureData: "data:image/png;base64,test",
      },
      placementSize: { width: 120, height: 60 },
      storeImageData: vi.fn(),
      setPlacementSize: vi.fn(),
      setSignaturesApplied: vi.fn(),
      setSignatureApiReady: vi.fn(),
    },
  };
});

vi.mock("@embedpdf/plugin-annotation/react", () => ({
  useAnnotationCapability: () => ({ provides: mocks.annotationApi }),
}));

vi.mock("@editor/contexts/SignatureContext", () => ({
  useSignature: () => ({
    ...mocks.signature,
    isPlacementMode: true,
    isApplyingSignatures: false,
  }),
}));

vi.mock("@editor/components/viewer/hooks/useDocumentReady", () => ({
  useDocumentReady: () => true,
}));

vi.mock("@editor/components/viewer/hooks/usePlacedSignatureTracking", () => ({
  usePlacedSignatureTracking: vi.fn(),
}));

describe("SignatureAPIBridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resetActiveTool();
  });

  it("does not retain sizes from Annotate image stamps", () => {
    render(<SignatureAPIBridge ref={createRef<SignatureAPI>()} />);

    act(() => {
      mocks.emitAnnotation({
        type: "create",
        annotation: {
          id: "annotate-stamp",
          type: PdfAnnotationSubtype.STAMP,
          rect: { size: { width: 200, height: 100 } },
          subject: "Stamp",
        },
      });
      mocks.emitAnnotation({
        type: "update",
        annotation: {
          id: "annotate-stamp",
          type: PdfAnnotationSubtype.STAMP,
          rect: { size: { width: 300, height: 150 } },
          subject: "Stamp",
        },
      });
    });

    expect(mocks.signature.setPlacementSize).not.toHaveBeenCalled();
    expect(mocks.signature.setSignaturesApplied).not.toHaveBeenCalled();
  });

  it("sets defaults before activating and refreshes the native stamp preview", async () => {
    const ref = createRef<SignatureAPI>();
    const rendered = render(<SignatureAPIBridge ref={ref} isSignMode />);
    await waitFor(() => expect(ref.current).not.toBeNull());

    vi.clearAllMocks();
    await act(async () => ref.current?.activateSignaturePlacementMode());

    const defaultsOrder =
      mocks.annotationApi.setToolDefaults.mock.invocationCallOrder[0];
    const stampActivation =
      mocks.annotationApi.setActiveTool.mock.calls.findIndex(
        ([id]) => id === "stamp",
      );
    expect(stampActivation).toBeGreaterThanOrEqual(0);
    expect(defaultsOrder).toBeLessThan(
      mocks.annotationApi.setActiveTool.mock.invocationCallOrder[
        stampActivation
      ],
    );

    vi.clearAllMocks();
    mocks.signature.placementSize = { width: 132, height: 66 };
    rendered.rerender(<SignatureAPIBridge ref={ref} isSignMode />);

    await waitFor(() => {
      expect(mocks.annotationApi.setToolDefaults).toHaveBeenCalledWith(
        "stamp",
        expect.objectContaining({ imageSize: { width: 132, height: 66 } }),
      );
      expect(mocks.annotationApi.setActiveTool).toHaveBeenCalledWith(null);
      expect(mocks.annotationApi.setActiveTool).toHaveBeenCalledWith("stamp");
    });
  });
});
