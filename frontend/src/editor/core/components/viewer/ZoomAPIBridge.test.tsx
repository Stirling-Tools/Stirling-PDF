import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZoomMode } from "@embedpdf/plugin-zoom/react";
import { SpreadMode } from "@embedpdf/plugin-spread/react";
import type { ZoomLevel } from "@embedpdf/plugin-zoom";

import { ZoomAPIBridge } from "@editor/components/viewer/ZoomAPIBridge";
import type { ZoomAPIWrapper } from "@editor/contexts/viewer/viewerBridges";

// Matches useFitWidthResize's default debounce.
const RESIZE_DEBOUNCE_MS = 150;

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
    };
  };

  // Fit modes resolve to fixed scales, standing in for the plugin's layout maths.
  const FIT_SCALE: Record<string, number> = {
    "fit-width": 1.5,
    "fit-page": 0.8,
    automatic: 1,
  };

  const createZoom = () => {
    let state = {
      zoomLevel: "fit-width" as ZoomLevel,
      currentZoomLevel: 1.5,
    };
    const stateChanges = emitter<void>();
    const zoomChanges = emitter<{ newZoom: number; level: ZoomLevel }>();
    const apply = (level: ZoomLevel) => {
      const newZoom = typeof level === "number" ? level : FIT_SCALE[level];
      state = { zoomLevel: level, currentZoomLevel: newZoom };
      stateChanges.emit();
      zoomChanges.emit({ newZoom, level });
    };
    return {
      getState: () => state,
      subscribe: stateChanges.on,
      provides: {
        getState: () => state,
        requestZoom: vi.fn((level: ZoomLevel) => apply(level)),
        zoomIn: vi.fn(() => apply(state.currentZoomLevel + 0.1)),
        zoomOut: vi.fn(() => apply(state.currentZoomLevel - 0.1)),
        toggleMarqueeZoom: vi.fn(),
        onZoomChange: zoomChanges.on,
      },
    };
  };

  const createSpread = () => {
    let mode = "none";
    const changes = emitter<void>();
    return {
      getMode: () => mode,
      subscribe: changes.on,
      setMode: (next: string) => {
        mode = next;
        changes.emit();
      },
      provides: { getSpreadPages: () => [[{ index: 0 }]] },
    };
  };

  const viewer = {
    registerBridge: vi.fn(),
    triggerImmediateZoomUpdate: vi.fn(),
  };
  const files = {
    all: { fileStubs: [{ id: "file-1" }] },
    selection: { selectedFileIds: ["file-1"] },
  };
  const page = { aspectRatio: 1.414 };

  return {
    zoom: createZoom(),
    spread: createSpread(),
    createZoom,
    createSpread,
    viewer,
    files,
    page,
  };
});

vi.mock("@embedpdf/plugin-zoom/react", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    ZoomMode: {
      Automatic: "automatic",
      FitPage: "fit-page",
      FitWidth: "fit-width",
    },
    useZoom: () => {
      const state = useSyncExternalStore(
        fixture.zoom.subscribe,
        fixture.zoom.getState,
      );
      return { provides: fixture.zoom.provides, state };
    },
  };
});
vi.mock("@embedpdf/plugin-spread/react", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    SpreadMode: { None: "none", Odd: "odd", Even: "even" },
    useSpread: () => {
      const spreadMode = useSyncExternalStore(
        fixture.spread.subscribe,
        fixture.spread.getMode,
      );
      return { provides: fixture.spread.provides, spreadMode };
    },
  };
});
vi.mock("@embedpdf/plugin-scroll/react", () => ({
  useScroll: () => ({ state: { totalPages: 3 } }),
}));
vi.mock("@editor/components/viewer/useActiveDocumentId", () => ({
  useActiveDocumentId: () => "doc-1",
}));
vi.mock("@editor/components/viewer/hooks/useDocumentReady", () => ({
  useDocumentReady: () => true,
}));
vi.mock("@editor/contexts/ViewerContext", () => ({
  useViewer: () => fixture.viewer,
}));
vi.mock("@editor/contexts/FileContext", () => ({
  useAllFiles: () => fixture.files.all,
  useFileSelection: () => fixture.files.selection,
}));
vi.mock("@editor/utils/pageMetadata", () => ({
  getFirstPageAspectRatioFromStub: () => fixture.page.aspectRatio,
}));
vi.mock("@editor/services/preferencesService", () => ({
  preferencesService: { getPreference: () => "auto" },
}));

function contextZoomApi(): ZoomAPIWrapper {
  const registrations = fixture.viewer.registerBridge.mock.calls.filter(
    ([type]) => type === "zoom",
  );
  return registrations[registrations.length - 1][1].api;
}

function zoomLevel(): ZoomLevel {
  return fixture.zoom.getState().zoomLevel;
}

function resizeWindow(height: number) {
  act(() => {
    window.innerHeight = height;
    window.dispatchEvent(new Event("resize"));
  });
  act(() => {
    vi.advanceTimersByTime(RESIZE_DEBOUNCE_MS);
  });
}

describe("ZoomAPIBridge fit modes", () => {
  const initialHeight = window.innerHeight;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    fixture.zoom = fixture.createZoom();
    fixture.spread = fixture.createSpread();
    fixture.page.aspectRatio = 1.414;
    window.innerHeight = 768;
  });

  afterEach(() => {
    vi.useRealTimers();
    window.innerHeight = initialHeight;
  });

  it("auto-zooms a portrait page below fit width on open", () => {
    render(<ZoomAPIBridge />);

    expect(typeof zoomLevel()).toBe("number");
  });

  it("keeps an explicit fit width across a window resize", () => {
    render(<ZoomAPIBridge />);

    act(() => contextZoomApi().requestZoom(ZoomMode.FitWidth));
    resizeWindow(600);

    expect(zoomLevel()).toBe(ZoomMode.FitWidth);
  });

  it("keeps an explicit fit width across a spread change", () => {
    // Tall enough that auto-zoom would still drop below fit width side by side.
    fixture.page.aspectRatio = 3;
    render(<ZoomAPIBridge />);

    act(() => contextZoomApi().requestZoom(ZoomMode.FitWidth));
    act(() => fixture.spread.setMode(SpreadMode.Odd));

    expect(zoomLevel()).toBe(ZoomMode.FitWidth);
  });

  it("re-evaluates a fit width it chose itself when the window resizes", () => {
    // A landscape page fits its whole height at fit width in a 768px window.
    fixture.page.aspectRatio = 0.5;
    render(<ZoomAPIBridge />);
    expect(zoomLevel()).toBe(ZoomMode.FitWidth);

    resizeWindow(300);

    expect(typeof zoomLevel()).toBe("number");
  });

  it("hands fit width back to auto-zoom once the user zooms manually", () => {
    fixture.page.aspectRatio = 0.5;
    render(<ZoomAPIBridge />);

    act(() => contextZoomApi().requestZoom(ZoomMode.FitWidth));
    act(() => contextZoomApi().zoomIn());
    act(() => fixture.zoom.provides.requestZoom(ZoomMode.FitWidth));
    resizeWindow(300);

    expect(typeof zoomLevel()).toBe("number");
  });

  it("re-arms the auto heuristic when Automatic replaces an explicit fit", () => {
    fixture.page.aspectRatio = 0.5;
    render(<ZoomAPIBridge />);

    act(() => contextZoomApi().requestZoom(ZoomMode.FitWidth));
    act(() => contextZoomApi().requestZoom(ZoomMode.Automatic));
    fixture.zoom.provides.requestZoom.mockClear();

    resizeWindow(300);

    // The resize hook refits width on its own; the auto heuristic adding its
    // pass on top of that is what shows the explicit fit was cleared.
    expect(fixture.zoom.provides.requestZoom.mock.calls.length).toBeGreaterThan(
      1,
    );
  });
});
