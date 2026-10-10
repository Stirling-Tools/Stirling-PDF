import { render, screen, act } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PdfViewerToolbar } from "@app/components/viewer/PdfViewerToolbar";

let scrollCallback: ((page: number, total: number) => void) | null = null;
let zoomCallback: ((percent: number) => void) | null = null;
let spreadCallback: ((mode: string, isDual: boolean) => void) | null = null;

const unregisterScroll = vi.fn();
const unregisterZoom = vi.fn();
const unregisterSpread = vi.fn();

const scrollState = { currentPage: 1, totalPages: 10 };
const zoomState = { zoomPercent: 100 };
const spreadState = { isDualPage: false };

const viewer = vi.hoisted(() => ({
  getScrollState: () => scrollState,
  getZoomState: () => zoomState,
  getSpreadState: () => spreadState,
  scrollActions: { scrollToPage: vi.fn() },
  zoomActions: { zoomIn: vi.fn(), zoomOut: vi.fn(), setZoomPercent: vi.fn() },
  spreadActions: { setSpreadMode: vi.fn(), toggleDualPage: vi.fn() },
  zoomRestorePendingRef: { current: false },
  zoomRestoreSettledTick: 0,
  registerImmediateScrollUpdate: vi.fn((cb) => {
    scrollCallback = cb;
    return unregisterScroll;
  }),
  registerImmediateZoomUpdate: vi.fn((cb) => {
    zoomCallback = cb;
    return unregisterZoom;
  }),
  registerImmediateSpreadUpdate: vi.fn((cb) => {
    spreadCallback = cb;
    return unregisterSpread;
  }),
  pdfRenderMode: "normal",
  cyclePdfRenderMode: vi.fn(),
}));

vi.mock("@app/contexts/ViewerContext", () => ({
  useViewer: () => viewer,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

describe("PdfViewerToolbar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scrollCallback = null;
    zoomCallback = null;
    spreadCallback = null;
    scrollState.currentPage = 1;
    zoomState.zoomPercent = 100;
    spreadState.isDualPage = false;
  });

  it("subscribes to immediate notifiers once and updates state when callbacks fire", () => {
    render(
      <MantineProvider>
        <PdfViewerToolbar currentPage={1} totalPages={10} />
      </MantineProvider>,
    );

    expect(viewer.registerImmediateScrollUpdate).toHaveBeenCalledTimes(1);
    expect(viewer.registerImmediateZoomUpdate).toHaveBeenCalledTimes(1);
    expect(viewer.registerImmediateSpreadUpdate).toHaveBeenCalledTimes(1);

    // Immediate callback fires for scroll
    act(() => {
      scrollCallback?.(5, 10);
    });

    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("5");

    // The subscription must NOT have been torn down and recreated
    expect(unregisterScroll).not.toHaveBeenCalled();
    expect(viewer.registerImmediateScrollUpdate).toHaveBeenCalledTimes(1);
  });

  it("updates zoom display when immediate zoom callback fires", () => {
    render(
      <MantineProvider>
        <PdfViewerToolbar currentPage={1} totalPages={10} />
      </MantineProvider>,
    );

    act(() => {
      zoomCallback?.(150);
    });

    expect(screen.getByText("150%")).toBeInTheDocument();
    expect(unregisterZoom).not.toHaveBeenCalled();

    act(() => {
      spreadCallback?.("dual", true);
    });

    expect(unregisterSpread).not.toHaveBeenCalled();
  });
});
