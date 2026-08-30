import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor, act } from "@testing-library/react";
import { PdfAnnotationSubtype } from "@embedpdf/models";

const mocks = vi.hoisted(() => ({
  annotationApi: null as unknown,
  signature: {} as Record<string, unknown>,
}));

vi.mock("@embedpdf/plugin-annotation/react", () => ({
  useAnnotationCapability: () => ({ provides: mocks.annotationApi }),
}));
vi.mock("@app/contexts/SignatureContext", () => ({
  useSignature: () => mocks.signature,
}));
vi.mock("@app/contexts/ViewerContext", () => ({
  useViewer: () => ({
    getZoomState: () => ({ currentZoom: 1 }),
    registerImmediateZoomUpdate: () => () => {},
  }),
}));
vi.mock("@app/components/viewer/hooks/useDocumentReady", () => ({
  useDocumentReady: () => true,
}));

import { SignatureAPIBridge } from "@app/components/viewer/SignatureAPIBridge";

const SIGNATURE_DATA = "data:image/png;base64,iVBORw0KGgo=";

type AnnotationEvent = {
  type: string;
  annotation: { id: string; type: number };
  ctx?: unknown;
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

/**
 * Stand-in for @embedpdf/plugin-annotation's capability. `placeStamp` mirrors
 * the real onCommit ordering (dist/index.js): the create event is emitted
 * synchronously, and only then does deactivateToolAfterCreate disarm the tool.
 */
function makeAnnotationApi() {
  const listeners = new Set<(event: AnnotationEvent) => void>();
  let activeTool: { id: string } | null = null;
  let placedCount = 0;

  return {
    setActiveTool: vi.fn((id: string | null) => {
      activeTool = id ? { id } : null;
    }),
    getActiveTool: vi.fn(() => activeTool),
    setToolDefaults: vi.fn(),
    onAnnotationEvent: vi.fn((cb: (event: AnnotationEvent) => void) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    }),
    getSelectedAnnotation: vi.fn(() => null),
    deleteAnnotation: vi.fn(),

    /** A pointer placement. Throws if the tool is disarmed, as the real one is a no-op then. */
    placeStamp(id: string) {
      if (activeTool?.id !== "stamp") {
        throw new Error(
          `Cannot place "${id}": stamp tool not armed (active: ${activeTool?.id ?? "none"})`,
        );
      }
      placedCount += 1;
      listeners.forEach((cb) =>
        cb({
          type: "create",
          annotation: { id, type: PdfAnnotationSubtype.STAMP },
          ctx: { pointer: true },
        }),
      );
      activeTool = null;
    },

    /** A paste / undo-redo restore: a create event with no pointer context. */
    restoreStamp(id: string) {
      listeners.forEach((cb) =>
        cb({
          type: "create",
          annotation: { id, type: PdfAnnotationSubtype.STAMP },
        }),
      );
    },

    activeToolId: () => activeTool?.id ?? null,
    placedCount: () => placedCount,
  };
}

type FakeAnnotationApi = ReturnType<typeof makeAnnotationApi>;

function setup(placeMultiple: boolean) {
  const api = makeAnnotationApi();
  mocks.annotationApi = api;
  const setPlacementMode = vi.fn();
  mocks.signature = {
    signatureConfig: {
      signatureType: "image",
      signatureData: SIGNATURE_DATA,
      reason: "Test",
    },
    storeImageData: vi.fn(),
    isPlacementMode: true,
    placementPreviewSize: { width: 100, height: 50 },
    setSignaturesApplied: vi.fn(),
    placeMultiple,
    autoExitAfterStampPlacement: true,
    setPlacementMode,
  };
  const view = render(<SignatureAPIBridge />);
  return { api, setPlacementMode, view };
}

const expectArmed = (api: FakeAnnotationApi) =>
  waitFor(() => expect(api.activeToolId()).toBe("stamp"));

describe("SignatureAPIBridge stamp re-arming", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lets the user place several stamps in a row when placeMultiple is on", async () => {
    const { api, setPlacementMode } = setup(true);
    await expectArmed(api);

    // First placement: the plugin disarms the tool the moment it commits.
    act(() => api.placeStamp("stamp-1"));
    expect(api.activeToolId()).toBeNull();

    // The bridge must re-arm it without the user re-selecting the tool.
    await expectArmed(api);
    act(() => api.placeStamp("stamp-2"));
    await expectArmed(api);
    act(() => api.placeStamp("stamp-3"));
    await expectArmed(api);

    expect(api.placedCount()).toBe(3);
    expect(setPlacementMode).not.toHaveBeenCalledWith(false);
  });

  it("leaves the tool disarmed and exits placement mode when placeMultiple is off", async () => {
    const { api, setPlacementMode } = setup(false);
    await expectArmed(api);

    act(() => api.placeStamp("stamp-1"));
    await settle();

    expect(setPlacementMode).toHaveBeenCalledWith(false);
    expect(api.activeToolId()).toBeNull();
    expect(api.placedCount()).toBe(1);
  });

  it("does not re-arm on a programmatic create (paste, undo/redo restore)", async () => {
    const { api } = setup(true);
    await expectArmed(api);
    const armCount = api.setToolDefaults.mock.calls.length;

    act(() => api.restoreStamp("pasted-1"));
    await settle();

    expect(api.setToolDefaults.mock.calls.length).toBe(armCount);
  });

  it("clears pending re-arm timers on unmount", async () => {
    const { api, view } = setup(true);
    await expectArmed(api);

    act(() => api.placeStamp("stamp-1"));
    act(() => view.unmount());
    await settle();

    expect(api.activeToolId()).toBeNull();
  });
});
