import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
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
    value: {
      getScrollState: () => ({ currentPage: 1, totalPages: 3 }),
      getZoomState: () => ({
        currentZoom: zoom.percent / 100,
        zoomPercent: zoom.percent,
        level: zoom.level,
      }),
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
    },
  };
});

vi.mock("@editor/contexts/ViewerContext", () => ({
  useViewer: () => viewer.value,
}));
vi.mock("@editor/contexts/viewer/ViewerPageTool", () => ({
  useViewerPageTool: () => (pageTool.open ? {} : null),
}));
const bar = vi.hoisted(() => ({
  buttons: [] as Array<Record<string, unknown>>,
  actions: {} as Record<string, () => void>,
}));
vi.mock("@editor/contexts/WorkbenchBarContext", () => ({
  useWorkbenchBar: () => ({
    buttons: bar.buttons,
    actions: bar.actions,
    allButtonsDisabled: false,
  }),
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

describe("PdfViewerToolbar registered controls", () => {
  beforeEach(() => {
    device.isPhone = false;
    bar.buttons = [];
  });

  it("draws the controls registered for the page bar, and only those", () => {
    bar.buttons = [
      {
        id: "page-tool",
        section: "page-bar",
        render: () => <button type="button">Page tool</button>,
      },
      {
        id: "hidden-page-tool",
        section: "page-bar",
        visible: false,
        render: () => <button type="button">Hidden tool</button>,
      },
      {
        id: "top-tool",
        section: "top",
        render: () => <button type="button">Top tool</button>,
      },
    ];
    renderToolbar();

    expect(screen.getByRole("button", { name: "Page tool" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Hidden tool" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Top tool" })).toBeNull();
  });
});
