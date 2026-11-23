import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import type { ZoomLevel } from "@embedpdf/plugin-zoom";
import { ZoomMode } from "@embedpdf/plugin-zoom/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PdfViewerToolbar } from "@editor/components/viewer/PdfViewerToolbar";

const device = vi.hoisted(() => ({ isPhone: false }));
const prefs = vi.hoisted(() => ({ defaultViewerZoom: "fitWidth" as string }));
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
vi.mock("@editor/contexts/PreferencesContext", () => ({
  usePreferences: () => ({ preferences: prefs, updatePreference: vi.fn() }),
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

describe("PdfViewerToolbar zoom controls", () => {
  beforeEach(() => {
    device.isPhone = false;
    prefs.defaultViewerZoom = "fitWidth";
    viewer.zoom.percent = 100;
    vi.clearAllMocks();
  });

  it("zooms to a typed percentage on Enter", async () => {
    const user = userEvent.setup();
    renderToolbar();
    const input = screen.getByTestId("viewer-zoom-input");
    await user.click(input);
    await user.keyboard("150{Enter}");
    expect(viewer.value.zoomActions.setZoomLevel).toHaveBeenCalledOnce();
    expect(viewer.value.zoomActions.setZoomLevel).toHaveBeenCalledWith(1.5);
  });

  it("holds a typed zoom to the supported range", async () => {
    const user = userEvent.setup();
    renderToolbar();
    await user.click(screen.getByTestId("viewer-zoom-input"));
    await user.keyboard("5000{Enter}");
    expect(viewer.value.zoomActions.setZoomLevel).toHaveBeenCalledWith(5);
  });

  it("leaves the zoom alone on Escape or on text that is not a number", async () => {
    const user = userEvent.setup();
    renderToolbar();
    const input = screen.getByTestId("viewer-zoom-input");
    await user.click(input);
    await user.keyboard("150{Escape}");
    await user.click(input);
    await user.keyboard("abc{Enter}");
    expect(viewer.value.zoomActions.setZoomLevel).not.toHaveBeenCalled();
    expect(input).toHaveValue("100%");
  });

  it("resets to the saved default fit", async () => {
    const user = userEvent.setup();
    prefs.defaultViewerZoom = "fitPage";
    renderToolbar();
    await user.click(screen.getByTestId("viewer-reset-zoom"));
    expect(viewer.value.zoomActions.requestZoom).toHaveBeenCalledWith(
      ZoomMode.FitPage,
    );
  });
});
