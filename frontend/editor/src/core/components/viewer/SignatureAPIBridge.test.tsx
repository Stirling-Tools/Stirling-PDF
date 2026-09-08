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
  committed: boolean;
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

/**
 * Stand-in for @embedpdf/plugin-annotation's capability, mirroring the event
 * sequence in dist/index.js: a pointer placement emits `create` twice for the
 * same annotation — synchronously from the history command with
 * `committed: false`, then again from emitCommitEvents with `committed: true`
 * once the engine round-trip resolves — and both carry the pointer context.
 * `deactivateToolAfterCreate` disarms the tool between the two. A history redo
 * re-runs the command, so it replays the uncommitted event verbatim.
 */
function makeAnnotationApi() {
  const listeners = new Set<(event: AnnotationEvent) => void>();
  let activeTool: { id: string } | null = null;
  let placedCount = 0;
  const uncommitted: string[] = [];

  const emit = (event: AnnotationEvent) => listeners.forEach((cb) => cb(event));

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

    /**
     * The pointer half of a placement: the uncommitted create, then the
     * plugin disarming the tool. Throws if the tool is disarmed, as the real
     * one is a no-op then.
     */
    placeStamp(id: string) {
      if (activeTool?.id !== "stamp") {
        throw new Error(
          `Cannot place "${id}": stamp tool not armed (active: ${activeTool?.id ?? "none"})`,
        );
      }
      placedCount += 1;
      uncommitted.push(id);
      emit({
        type: "create",
        annotation: { id, type: PdfAnnotationSubtype.STAMP },
        ctx: { pointer: true },
        committed: false,
      });
      activeTool = null;
    },

    /** The engine round-trip resolving: the committed repeat of each placement. */
    flushCommits() {
      const pending = uncommitted.splice(0, uncommitted.length);
      for (const id of pending) {
        emit({
          type: "create",
          annotation: { id, type: PdfAnnotationSubtype.STAMP },
          ctx: { pointer: true },
          committed: true,
        });
      }
    },

    /** A whole placement: pointer event and its committed repeat. */
    placeAndCommitStamp(id: string) {
      this.placeStamp(id);
      this.flushCommits();
    },

    /** A history redo: the command re-runs, replaying the uncommitted event. */
    redoStamp(id: string) {
      uncommitted.push(id);
      emit({
        type: "create",
        annotation: { id, type: PdfAnnotationSubtype.STAMP },
        ctx: { pointer: true },
        committed: false,
      });
    },

    /** A paste / an undone delete being restored: a create with no pointer context. */
    restoreStamp(id: string) {
      emit({
        type: "create",
        annotation: { id, type: PdfAnnotationSubtype.STAMP },
        committed: false,
      });
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
  const pausePlacement = () => {
    mocks.signature.isPlacementMode = false;
    view.rerender(<SignatureAPIBridge />);
  };
  return { api, setPlacementMode, pausePlacement, view };
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

    act(() => api.flushCommits());

    // The bridge must re-arm it without the user re-selecting the tool.
    await expectArmed(api);
    act(() => api.placeAndCommitStamp("stamp-2"));
    await expectArmed(api);
    act(() => api.placeAndCommitStamp("stamp-3"));
    await expectArmed(api);

    expect(api.placedCount()).toBe(3);
    expect(setPlacementMode).not.toHaveBeenCalledWith(false);
  });

  it("leaves the tool disarmed and exits placement mode when placeMultiple is off", async () => {
    const { api, setPlacementMode } = setup(false);
    await expectArmed(api);

    act(() => api.placeAndCommitStamp("stamp-1"));
    await settle();

    expect(setPlacementMode).toHaveBeenCalledTimes(1);
    expect(setPlacementMode).toHaveBeenCalledWith(false);
    expect(api.activeToolId()).toBeNull();
    expect(api.placedCount()).toBe(1);
  });

  it("ignores the committed repeat of a placement", async () => {
    const { api } = setup(true);
    await expectArmed(api);

    act(() => api.placeStamp("stamp-1"));
    await expectArmed(api);
    const armCount = api.setToolDefaults.mock.calls.length;

    act(() => api.flushCommits());
    await settle();

    expect(api.setToolDefaults.mock.calls.length).toBe(armCount);
  });

  it("does not re-arm when placement is paused between the two create events", async () => {
    const { api, pausePlacement } = setup(true);
    await expectArmed(api);

    act(() => api.placeStamp("stamp-1"));
    act(() => pausePlacement());
    act(() => api.flushCommits());
    await settle();

    expect(api.activeToolId()).toBeNull();
    expect(api.placedCount()).toBe(1);
  });

  it("stays in placement mode when a placement is redone", async () => {
    const { api, setPlacementMode } = setup(false);
    await expectArmed(api);

    act(() => api.placeAndCommitStamp("stamp-1"));
    await settle();
    setPlacementMode.mockClear();

    // Undo emits `delete`; redo re-runs the create command with the original
    // pointer context, so only the annotation id tells it from a placement.
    act(() => api.redoStamp("stamp-1"));
    await settle();

    expect(setPlacementMode).not.toHaveBeenCalled();
  });

  it("does not re-arm on a programmatic create (paste, restored delete)", async () => {
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
