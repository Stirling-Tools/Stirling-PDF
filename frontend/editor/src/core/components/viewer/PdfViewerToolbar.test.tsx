import { render, screen, act } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PdfViewerToolbar } from "@app/components/viewer/PdfViewerToolbar";

const viewer = vi.hoisted(() => {
  const scrollState = { currentPage: 1, totalPages: 10 };
  const zoomState = { zoomPercent: 100 };
  const spreadState = { isDualPage: false };
  const callbacks = {
    scroll: null as ((page: number, total: number) => void) | null,
    zoom: null as ((percent: number) => void) | null,
    spread: null as ((mode: string, isDual: boolean) => void) | null,
  };
  return {
    scrollState,
    zoomState,
    spreadState,
    callbacks,
    unregisterScroll: vi.fn(),
    unregisterZoom: vi.fn(),
    unregisterSpread: vi.fn(),
    getScrollState: () => scrollState,
    getZoomState: () => zoomState,
    getSpreadState: () => spreadState,
    scrollActions: { scrollToPage: vi.fn() },
    zoomActions: { zoomIn: vi.fn(), zoomOut: vi.fn(), setZoomPercent: vi.fn() },
    spreadActions: { setSpreadMode: vi.fn(), toggleDualPage: vi.fn() },
    zoomRestorePendingRef: { current: false },
    zoomRestoreSettledTick: 0,
    registerImmediateScrollUpdate: vi.fn((cb) => {
      callbacks.scroll = cb;
      return viewer.unregisterScroll;
    }),
    registerImmediateZoomUpdate: vi.fn((cb) => {
      callbacks.zoom = cb;
      return viewer.unregisterZoom;
    }),
    registerImmediateSpreadUpdate: vi.fn((cb) => {
      callbacks.spread = cb;
      return viewer.unregisterSpread;
    }),
    pdfRenderMode: "normal",
    cyclePdfRenderMode: vi.fn(),
  };
});

vi.mock("@app/contexts/ViewerContext", () => ({
  useViewer: () => viewer,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

function renderToolbar() {
  return render(
    <MantineProvider>
      <PdfViewerToolbar currentPage={1} totalPages={10} />
    </MantineProvider>,
  );
}

describe("PdfViewerToolbar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    viewer.callbacks.scroll = null;
    viewer.callbacks.zoom = null;
    viewer.callbacks.spread = null;
    viewer.scrollState.currentPage = 1;
    viewer.zoomState.zoomPercent = 100;
    viewer.spreadState.isDualPage = false;
  });

  it("subscribes to immediate notifiers once and updates state when callbacks fire", () => {
    renderToolbar();

    expect(viewer.registerImmediateScrollUpdate).toHaveBeenCalledTimes(1);
    expect(viewer.registerImmediateZoomUpdate).toHaveBeenCalledTimes(1);
    expect(viewer.registerImmediateSpreadUpdate).toHaveBeenCalledTimes(1);

    // Immediate callback fires for scroll
    act(() => {
      viewer.callbacks.scroll?.(5, 10);
    });

    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("5");

    // The subscription must NOT have been torn down and recreated
    expect(viewer.unregisterScroll).not.toHaveBeenCalled();
    expect(viewer.registerImmediateScrollUpdate).toHaveBeenCalledTimes(1);
  });

  it("updates zoom display when immediate zoom callback fires", () => {
    renderToolbar();

    act(() => {
      viewer.callbacks.zoom?.(150);
    });

    expect(screen.getByText("150%")).toBeInTheDocument();
    expect(viewer.unregisterZoom).not.toHaveBeenCalled();

    act(() => {
      viewer.callbacks.spread?.("dual", true);
    });

    expect(viewer.unregisterSpread).not.toHaveBeenCalled();
  });

  it("keeps the subscriptions bound across rerenders with new state values", () => {
    const { rerender } = renderToolbar();

    viewer.zoomState.zoomPercent = 120;
    rerender(
      <MantineProvider>
        <PdfViewerToolbar currentPage={2} totalPages={10} />
      </MantineProvider>,
    );

    expect(viewer.registerImmediateScrollUpdate).toHaveBeenCalledTimes(1);
    expect(viewer.registerImmediateZoomUpdate).toHaveBeenCalledTimes(1);
    expect(viewer.unregisterScroll).not.toHaveBeenCalled();
    expect(screen.getByText("120%")).toBeInTheDocument();
  });
});
