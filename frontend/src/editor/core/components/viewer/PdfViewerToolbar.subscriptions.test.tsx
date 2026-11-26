import { render, screen, act } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PdfViewerToolbar } from "@editor/components/viewer/PdfViewerToolbar";

let scrollCallback: ((page: number, total: number) => void) | null = null;
let zoomCallback: ((percent: number) => void) | null = null;

const unregisterScroll = vi.fn();
const unregisterZoom = vi.fn();

const scrollState = { currentPage: 1, totalPages: 10 };
const zoomState = { zoomPercent: 100, level: undefined };

const viewer = vi.hoisted(() => ({
  getScrollState: () => scrollState,
  getZoomState: () => zoomState,
  scrollActions: { scrollToPage: vi.fn() },
  zoomActions: { zoomIn: vi.fn(), zoomOut: vi.fn(), setZoomPercent: vi.fn() },
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
  pdfRenderMode: "normal",
  cyclePdfRenderMode: vi.fn(),
}));

vi.mock("@editor/contexts/ViewerContext", () => ({
  useViewer: () => viewer,
}));

vi.mock("@editor/contexts/WorkbenchBarContext", () => ({
  useWorkbenchBar: () => ({
    buttons: [],
    actions: {},
    allButtonsDisabled: false,
  }),
}));

vi.mock("@editor/contexts/viewer/ViewerPageTool", () => ({
  useViewerPageTool: () => null,
}));

vi.mock("@editor/contexts/PreferencesContext", () => ({
  usePreferences: () => ({
    preferences: { defaultViewerZoom: "fitWidth" },
    updatePreference: vi.fn(),
  }),
}));

vi.mock("@editor/hooks/useIsMobile", () => ({
  useIsPhone: () => false,
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
    scrollState.currentPage = 1;
    zoomState.zoomPercent = 100;
  });

  it("subscribes to immediate notifiers once and updates state when callbacks fire", () => {
    render(
      <MantineProvider>
        <PdfViewerToolbar currentPage={1} totalPages={10} />
      </MantineProvider>,
    );

    expect(viewer.registerImmediateScrollUpdate).toHaveBeenCalledTimes(1);
    expect(viewer.registerImmediateZoomUpdate).toHaveBeenCalledTimes(1);

    // Immediate callback fires for scroll
    act(() => {
      scrollCallback?.(5, 10);
    });

    const input = screen.getByRole("textbox", {
      name: "Page number",
    }) as HTMLInputElement;
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

    expect(screen.getByTestId("viewer-zoom-input")).toHaveValue("150%");
    expect(unregisterZoom).not.toHaveBeenCalled();
    expect(viewer.registerImmediateZoomUpdate).toHaveBeenCalledTimes(1);
  });
});
