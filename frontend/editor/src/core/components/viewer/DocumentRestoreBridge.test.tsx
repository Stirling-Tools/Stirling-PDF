import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SpreadMode } from "@embedpdf/plugin-spread/react";
import { ZoomMode } from "@embedpdf/plugin-zoom/react";
import {
  DocumentRestoreBridge,
  type DocumentRestoreEvent,
  type DocumentRestoreRequest,
} from "@app/components/viewer/DocumentRestoreBridge";
import type { useActiveDocumentId } from "@app/components/viewer/useActiveDocumentId";

const activeDocument = vi.hoisted<{
  id: ReturnType<typeof useActiveDocumentId>;
}>(() => ({ id: "second" }));

const fixture = vi.hoisted(() => {
  type Listener<T> = (value: T) => void;
  const emitter = <T,>() => {
    const listeners = new Set<Listener<T>>();
    return {
      on: (listener: Listener<T>) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      emit: (value: T) => {
        for (const listener of [...listeners]) listener(value);
      },
      size: () => listeners.size,
    };
  };

  // Requests apply synchronously and fire the change hook unless dropped or clamped.
  const zoomScope = () => {
    const state = {
      zoomLevel: "fit-width" as string | number,
      currentZoomLevel: 1.97,
      isMarqueeZoomActive: false,
    };
    const changes = emitter<typeof state>();
    const passes = emitter<{ newZoom: number }>();
    const scope = {
      drop: false,
      clampTo: null as number | null,
      requestZoom: vi.fn((level: string | number) => {
        if (scope.drop) return;
        const zoomValue = typeof level === "number" ? level : 1.97;
        state.zoomLevel =
          typeof level === "number" ? (scope.clampTo ?? zoomValue) : level;
        state.currentZoomLevel = scope.clampTo ?? zoomValue;
        changes.emit({ ...state });
        passes.emit({ newZoom: state.currentZoomLevel });
      }),
      getState: () => ({ ...state }),
      onStateChange: changes.on,
      onZoomChange: passes.on,
      preset: (zoomLevel: string | number, currentZoomLevel: number) => {
        state.zoomLevel = zoomLevel;
        state.currentZoomLevel = currentZoomLevel;
      },
    };
    return scope;
  };
  const spreadScope = () => {
    let mode = "none";
    const changes = emitter<string>();
    return {
      setSpreadMode: vi.fn((next: string) => {
        if (next === mode) return;
        mode = next;
        changes.emit(next);
      }),
      getSpreadMode: () => mode,
      onSpreadChange: changes.on,
      preset: (next: string) => {
        mode = next;
      },
    };
  };
  const rotateScope = () => {
    let rotation = 0;
    const changes = emitter<number>();
    return {
      setRotation: vi.fn((next: number) => {
        rotation = next;
        changes.emit(next);
      }),
      getRotation: () => rotation,
      onRotateChange: changes.on,
      preset: (next: number) => {
        rotation = next;
      },
    };
  };
  const perDocument = <T,>(make: () => T) => {
    const scopes = new Map<string, T>();
    return {
      forDocument: (id: string) => {
        let scope = scopes.get(id);
        if (!scope) {
          scope = make();
          scopes.set(id, scope);
        }
        return scope;
      },
    };
  };

  const createFixture = () => {
    const layoutReady = emitter<{ documentId: string; totalPages: number }>();
    const layoutChange = emitter<{ documentId: string }>();
    const viewportResize = emitter<{ documentId: string }>();
    const scrollRequests = perDocument(() =>
      emitter<{ x: number; y: number }>(),
    );
    return {
      zoom: perDocument(zoomScope),
      spread: perDocument(spreadScope),
      rotate: perDocument(rotateScope),
      layoutReady,
      layoutChange,
      viewportResize,
      scrollRequests,
      scroll: {
        onLayoutReady: layoutReady.on,
        onLayoutChange: layoutChange.on,
      },
      viewport: { onViewportResize: viewportResize.on },
      viewportPlugin: {
        onScrollRequest: (
          documentId: string,
          listener: (request: { x: number; y: number }) => void,
        ) => scrollRequests.forDocument(documentId).on(listener),
      },
    };
  };
  return { current: createFixture(), createFixture };
});

vi.mock("@app/components/viewer/useActiveDocumentId", () => ({
  useActiveDocumentId: () => activeDocument.id,
  useDocumentReady: () => true,
}));
vi.mock("@embedpdf/plugin-zoom/react", () => ({
  ZoomMode: {
    Automatic: "automatic",
    FitPage: "fit-page",
    FitWidth: "fit-width",
  },
  useZoomCapability: () => ({ provides: fixture.current.zoom }),
}));
vi.mock("@embedpdf/plugin-spread/react", () => ({
  SpreadMode: { None: "none", Odd: "odd", Even: "even" },
  useSpreadCapability: () => ({ provides: fixture.current.spread }),
}));
vi.mock("@embedpdf/plugin-rotate/react", () => ({
  useRotateCapability: () => ({ provides: fixture.current.rotate }),
}));
vi.mock("@embedpdf/plugin-scroll/react", () => ({
  useScrollCapability: () => ({ provides: fixture.current.scroll }),
}));
vi.mock("@embedpdf/plugin-viewport/react", () => ({
  useViewportCapability: () => ({ provides: fixture.current.viewport }),
  useViewportPlugin: () => ({ plugin: fixture.current.viewportPlugin }),
}));

const request = (
  overrides?: Partial<DocumentRestoreRequest>,
): DocumentRestoreRequest => ({
  documentId: "second",
  zoom: 1.42,
  spread: SpreadMode.Odd,
  rotation: 1,
  ...overrides,
});

function layoutReady(documentId = "second", totalPages = 3) {
  act(() => fixture.current.layoutReady.emit({ documentId, totalPages }));
}

function renderBridge(props: {
  request: DocumentRestoreRequest | null;
  restorePending?: boolean;
  laidOut?: boolean;
}) {
  const events: DocumentRestoreEvent[] = [];
  const view = () => (
    <DocumentRestoreBridge
      request={props.request}
      restorePending={props.restorePending ?? false}
      onEvent={(event) => events.push(event)}
    />
  );
  const utils = render(view());
  if (props.laidOut ?? true) layoutReady();
  return {
    events,
    types: () =>
      events
        .map((event) => event.type)
        .filter((type) => type !== "layout-ready"),
    rerender: () => utils.rerender(view()),
  };
}

describe("DocumentRestoreBridge", () => {
  beforeEach(() => {
    activeDocument.id = "second";
    fixture.current = fixture.createFixture();
  });

  it("lands the carried values on the replacement and confirms each from the plugin's own change", () => {
    const { types } = renderBridge({ request: request() });

    const replacement = {
      zoom: fixture.current.zoom.forDocument("second"),
      spread: fixture.current.spread.forDocument("second"),
      rotate: fixture.current.rotate.forDocument("second"),
    };
    expect(replacement.rotate.setRotation).toHaveBeenCalledExactlyOnceWith(1);
    expect(replacement.spread.setSpreadMode).toHaveBeenCalledExactlyOnceWith(
      "odd",
    );
    expect(replacement.zoom.requestZoom).toHaveBeenCalledExactlyOnceWith(1.42);
    expect(types()).toEqual(["rotation", "spread", "zoom"]);
  });

  it("leaves a replacement alone whose state already matches", () => {
    const replacement = {
      zoom: fixture.current.zoom.forDocument("second"),
      spread: fixture.current.spread.forDocument("second"),
      rotate: fixture.current.rotate.forDocument("second"),
    };
    replacement.zoom.preset(1.42, 1.42);
    replacement.spread.preset("odd");
    replacement.rotate.preset(1);

    const { types } = renderBridge({ request: request() });

    expect(replacement.rotate.setRotation).not.toHaveBeenCalled();
    expect(replacement.spread.setSpreadMode).not.toHaveBeenCalled();
    expect(replacement.zoom.requestZoom).not.toHaveBeenCalled();
    expect(types()).toEqual(["rotation", "spread", "zoom"]);
  });

  it("re-requests a zoom the plugin dropped once the viewport reports a size", () => {
    const zoom = fixture.current.zoom.forDocument("second");
    zoom.drop = true;

    const { types } = renderBridge({
      request: request({ spread: null, rotation: null }),
    });
    expect(zoom.requestZoom).toHaveBeenCalledTimes(1);
    expect(types()).toEqual([]);

    zoom.drop = false;
    act(() => fixture.current.viewportResize.emit({ documentId: "second" }));

    expect(zoom.requestZoom).toHaveBeenCalledTimes(2);
    expect(types()).toEqual(["zoom"]);
  });

  it("re-requests a zoom the plugin's own fit pass overrode", () => {
    const zoom = fixture.current.zoom.forDocument("second");
    zoom.drop = true;

    renderBridge({ request: request({ spread: null, rotation: null }) });
    zoom.drop = false;
    act(() => zoom.requestZoom("fit-width"));

    expect(zoom.requestZoom).toHaveBeenLastCalledWith(1.42);
    expect(zoom.getState().currentZoomLevel).toBe(1.42);
  });

  it("confirms a carried mode only once the plugin has fitted the replacement", () => {
    const zoom = fixture.current.zoom.forDocument("second");
    zoom.preset("fit-width", 1);
    zoom.drop = true;

    const { types } = renderBridge({
      request: request({
        zoom: ZoomMode.FitWidth,
        spread: null,
        rotation: null,
      }),
    });
    expect(zoom.requestZoom).toHaveBeenCalledExactlyOnceWith("fit-width");
    expect(types()).toEqual([]);

    zoom.drop = false;
    act(() => fixture.current.viewportResize.emit({ documentId: "second" }));

    expect(zoom.requestZoom).toHaveBeenCalledTimes(2);
    expect(zoom.getState().currentZoomLevel).toBe(1.97);
    expect(types()).toEqual(["zoom"]);
  });

  it("keeps asking while requests are dropped and counts only the plugin's answers", () => {
    const zoom = fixture.current.zoom.forDocument("second");
    zoom.drop = true;

    renderBridge({ request: request({ spread: null, rotation: null }) });
    for (let i = 0; i < 8; i += 1) {
      act(() => fixture.current.layoutChange.emit({ documentId: "second" }));
    }
    expect(zoom.requestZoom).toHaveBeenCalledTimes(9);

    zoom.drop = false;
    act(() => fixture.current.viewportResize.emit({ documentId: "second" }));
    expect(zoom.getState().currentZoomLevel).toBe(1.42);
  });

  it("stops asking after repeated refusals instead of fighting the plugin", () => {
    const zoom = fixture.current.zoom.forDocument("second");
    zoom.clampTo = 1.5;

    const { types } = renderBridge({
      request: request({ spread: null, rotation: null }),
    });

    expect(zoom.requestZoom).toHaveBeenCalledTimes(5);
    expect(types()).toEqual(["zoom"]);
  });

  it("waits for the replacement's layout before asking for anything", () => {
    const { types } = renderBridge({ request: request(), laidOut: false });
    const replacement = {
      zoom: fixture.current.zoom.forDocument("second"),
      spread: fixture.current.spread.forDocument("second"),
      rotate: fixture.current.rotate.forDocument("second"),
    };
    expect(replacement.rotate.setRotation).not.toHaveBeenCalled();
    expect(replacement.spread.setSpreadMode).not.toHaveBeenCalled();
    expect(replacement.zoom.requestZoom).not.toHaveBeenCalled();
    expect(types()).toEqual([]);

    layoutReady("first");
    expect(replacement.spread.setSpreadMode).not.toHaveBeenCalled();

    layoutReady("second");
    expect(replacement.spread.setSpreadMode).toHaveBeenCalledExactlyOnceWith(
      "odd",
    );
    expect(types()).toEqual(["rotation", "spread", "zoom"]);
  });

  it("forwards the replacement's layout and scroll events and ignores other documents'", () => {
    const { events } = renderBridge({
      request: null,
      restorePending: true,
      laidOut: false,
    });

    act(() => {
      fixture.current.layoutReady.emit({ documentId: "first", totalPages: 9 });
      fixture.current.scrollRequests
        .forDocument("first")
        .emit({ x: 0, y: 400 });
    });
    expect(events).toEqual([]);

    act(() => {
      fixture.current.layoutReady.emit({ documentId: "second", totalPages: 2 });
      fixture.current.layoutChange.emit({ documentId: "second" });
      fixture.current.scrollRequests
        .forDocument("second")
        .emit({ x: 0, y: 120 });
    });
    expect(events).toEqual([
      { type: "layout-ready", totalPages: 2 },
      { type: "layout-change" },
      { type: "scroll-request", top: 120 },
    ]);
  });

  it("waits for the document the request is addressed to", () => {
    activeDocument.id = "first";
    const { types, rerender } = renderBridge({ request: request() });

    expect(
      fixture.current.rotate.forDocument("first").setRotation,
    ).not.toHaveBeenCalled();
    expect(types()).toEqual([]);

    activeDocument.id = "second";
    rerender();
    layoutReady();

    expect(
      fixture.current.rotate.forDocument("second").setRotation,
    ).toHaveBeenCalledExactlyOnceWith(1);
    expect(types()).toEqual(["rotation", "spread", "zoom"]);
  });

  it("subscribes to nothing while no restore is in flight", () => {
    renderBridge({ request: null, restorePending: false, laidOut: false });

    expect(fixture.current.layoutReady.size()).toBe(0);
    expect(fixture.current.viewportResize.size()).toBe(0);
    expect(fixture.current.scrollRequests.forDocument("second").size()).toBe(0);
  });
});
