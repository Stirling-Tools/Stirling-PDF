import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import { ZoomMode } from "@embedpdf/plugin-zoom/react";
import type { ZoomLevel } from "@embedpdf/plugin-zoom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PdfViewerToolbar } from "@editor/components/viewer/PdfViewerToolbar";

const device = vi.hoisted(() => ({ isPhone: false }));
const pageTool = vi.hoisted(() => ({ open: false }));

// Built once: the toolbar's effects depend on the identity of these values.
const viewer = vi.hoisted(() => {
  const zoomListeners = new Set<(percent: number) => void>();
  const zoom = { level: undefined as ZoomLevel | undefined, percent: 100 };
  return {
    zoom,
    notifyZoom: (level: ZoomLevel, percent: number) => {
      zoom.level = level;
      zoom.percent = percent;
      for (const listener of [...zoomListeners]) listener(percent);
    },
    value: {
      getScrollState: () => ({ currentPage: 1, totalPages: 3 }),
      getZoomState: () => ({
        currentZoom: zoom.percent / 100,
        zoomPercent: zoom.percent,
        level: zoom.level,
      }),
      getSpreadState: () => ({ isDualPage: false }),
      scrollActions: {
        scrollToPage: vi.fn(),
        scrollToFirstPage: vi.fn(),
        scrollToLastPage: vi.fn(),
      },
      zoomActions: {
        zoomIn: vi.fn(),
        zoomOut: vi.fn(),
        requestZoom: vi.fn(),
        setZoomLevel: vi.fn(),
      },
      spreadActions: { toggleSpreadMode: vi.fn() },
      rotationActions: { rotateForward: vi.fn(), rotateBackward: vi.fn() },
      zoomRestorePendingRef: { current: false },
      zoomRestoreSettledTick: 0,
      registerImmediateZoomUpdate: (listener: (percent: number) => void) => {
        zoomListeners.add(listener);
        return () => {
          zoomListeners.delete(listener);
        };
      },
      registerImmediateScrollUpdate: () => () => {},
      registerImmediateSpreadUpdate: () => () => {},
      pdfRenderMode: "normal",
      cyclePdfRenderMode: vi.fn(),
    },
  };
});

vi.mock("@editor/contexts/ViewerContext", () => ({
  useViewer: () => viewer.value,
}));
vi.mock("@editor/contexts/viewer/ViewerPageTool", () => ({
  useViewerPageTool: () => (pageTool.open ? {} : null),
}));
vi.mock("@editor/hooks/useIsMobile", () => ({
  useIsPhone: () => device.isPhone,
}));

const renderToolbar = () =>
  render(
    <MantineProvider>
      <PdfViewerToolbar />
    </MantineProvider>,
  );

describe("PdfViewerToolbar fit controls", () => {
  beforeEach(() => {
    device.isPhone = false;
    viewer.zoom.level = 1;
    viewer.zoom.percent = 100;
    vi.clearAllMocks();
  });

  it("requests the plugin's fit modes", async () => {
    const user = userEvent.setup();
    renderToolbar();

    await user.click(screen.getByRole("button", { name: "viewer.fitWidth" }));
    await user.click(screen.getByRole("button", { name: "viewer.fitPage" }));

    expect(viewer.value.zoomActions.requestZoom.mock.calls).toEqual([
      [ZoomMode.FitWidth],
      [ZoomMode.FitPage],
    ]);
  });

  it("presses the button for the mode the plugin reports", () => {
    renderToolbar();
    const fitWidth = screen.getByRole("button", { name: "viewer.fitWidth" });
    const fitPage = screen.getByRole("button", { name: "viewer.fitPage" });
    expect(fitWidth).toHaveAttribute("aria-pressed", "false");
    expect(fitPage).toHaveAttribute("aria-pressed", "false");

    act(() => viewer.notifyZoom(ZoomMode.FitWidth, 150));
    expect(fitWidth).toHaveAttribute("aria-pressed", "true");
    expect(fitPage).toHaveAttribute("aria-pressed", "false");

    // Same percent as fit width: the level alone has to move the pressed state.
    act(() => viewer.notifyZoom(ZoomMode.FitPage, 150));
    expect(fitWidth).toHaveAttribute("aria-pressed", "false");
    expect(fitPage).toHaveAttribute("aria-pressed", "true");

    act(() => viewer.notifyZoom(1.2, 120));
    expect(fitWidth).toHaveAttribute("aria-pressed", "false");
    expect(fitPage).toHaveAttribute("aria-pressed", "false");
  });

  it("marks the active fit mode in the phone menu", async () => {
    device.isPhone = true;
    viewer.zoom.level = ZoomMode.FitPage;
    renderToolbar();

    fireEvent.click(screen.getByRole("button", { name: "viewer.moreOptions" }));
    const fitPage = await screen.findByRole("menuitem", {
      name: "viewer.fitPage",
    });
    const fitWidth = await screen.findByRole("menuitem", {
      name: "viewer.fitWidth",
    });

    expect(fitPage).toHaveAttribute("aria-current", "true");
    expect(fitWidth).not.toHaveAttribute("aria-current");

    fireEvent.click(fitWidth);
    expect(viewer.value.zoomActions.requestZoom).toHaveBeenCalledWith(
      ZoomMode.FitWidth,
    );
  });
});

describe("PdfViewerToolbar rotate controls", () => {
  beforeEach(() => {
    device.isPhone = false;
    pageTool.open = false;
    vi.clearAllMocks();
  });

  it("rotates the view either way", async () => {
    const user = userEvent.setup();
    renderToolbar();

    await user.click(
      screen.getByRole("button", { name: "workbenchBar.rotateLeft" }),
    );
    await user.click(
      screen.getByRole("button", { name: "workbenchBar.rotateRight" }),
    );

    expect(viewer.value.rotationActions.rotateBackward).toHaveBeenCalledOnce();
    expect(viewer.value.rotationActions.rotateForward).toHaveBeenCalledOnce();
  });

  it("holds the view still while a page tool is open", () => {
    pageTool.open = true;
    renderToolbar();

    expect(
      screen.getByRole("button", { name: "workbenchBar.rotateLeft" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "workbenchBar.rotateRight" }),
    ).toBeDisabled();
  });
});
