import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import { ZoomMode } from "@embedpdf/plugin-zoom/react";
import type { ZoomLevel } from "@embedpdf/plugin-zoom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PdfViewerToolbar } from "@editor/components/viewer/PdfViewerToolbar";

const device = vi.hoisted(() => ({ isPhone: false }));

// Built once: the toolbar's effects depend on the identity of these values.
const viewer = vi.hoisted(() => {
  const zoomListeners = new Set<(percent: number) => void>();
  const zoom = { level: undefined as ZoomLevel | undefined, percent: 100 };
  const scroll = { currentPage: 1 };
  return {
    zoom,
    scroll,
    notifyZoom: (level: ZoomLevel, percent: number) => {
      zoom.level = level;
      zoom.percent = percent;
      for (const listener of [...zoomListeners]) listener(percent);
    },
    value: {
      getScrollState: () => ({
        currentPage: scroll.currentPage,
        totalPages: 3,
      }),
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
vi.mock("@editor/hooks/useIsMobile", () => ({
  useIsPhone: () => device.isPhone,
}));

const renderToolbar = (pageLabels?: string[]) =>
  render(
    <MantineProvider>
      <PdfViewerToolbar pageLabels={pageLabels} />
    </MantineProvider>,
  );

describe("PdfViewerToolbar fit controls", () => {
  beforeEach(() => {
    device.isPhone = false;
    viewer.zoom.level = 1;
    viewer.zoom.percent = 100;
    viewer.scroll.currentPage = 1;
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

describe("PdfViewerToolbar page labels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // `/PageLabels` can carry entries without `/S` or `/P`, which `getPageLabels`
  // reports as "", so those pages must still show their index.
  it("falls back to the page index for an unlabelled current page", () => {
    viewer.scroll.currentPage = 2;
    renderToolbar(["i", "", "iii"]);

    expect(screen.getByRole("textbox")).toHaveValue("2");
    expect(screen.getByText("/ iii")).toBeInTheDocument();
  });

  it("falls back to the page index for an unlabelled last page", () => {
    viewer.scroll.currentPage = 2;
    renderToolbar(["i", "ii", ""]);

    expect(screen.getByRole("textbox")).toHaveValue("ii");
    expect(screen.getByText("/ 3")).toBeInTheDocument();
  });

  // A restarted numbering makes page 2 carry the same label as page 1; blurring
  // the unchanged field must keep the current page, not resolve the duplicate to
  // the first occurrence.
  it("keeps the current page when its repeated label is committed unchanged", () => {
    viewer.scroll.currentPage = 2;
    renderToolbar(["1", "1", "2"]);

    const input = screen.getByRole("textbox");
    expect(input).toHaveValue("1");

    fireEvent.blur(input);

    expect(viewer.value.scrollActions.scrollToPage).not.toHaveBeenCalled();
  });

  it("keeps the index path open for a later duplicate label", () => {
    viewer.scroll.currentPage = 1;
    renderToolbar(["1", "2", "1"]);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "3" } });
    fireEvent.blur(input);

    expect(viewer.value.scrollActions.scrollToPage).toHaveBeenCalledWith(3);
  });

  it("navigates to a different label", () => {
    viewer.scroll.currentPage = 1;
    renderToolbar(["i", "ii", "iii"]);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "iii" } });
    fireEvent.blur(input);
    expect(viewer.value.scrollActions.scrollToPage).toHaveBeenCalledWith(3);
  });

  it("rejects a fractional page index", () => {
    viewer.scroll.currentPage = 1;
    renderToolbar(["i", "ii", "iii"]);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "1.5" } });
    fireEvent.blur(input);
    expect(viewer.value.scrollActions.scrollToPage).not.toHaveBeenCalled();
    expect(input).toHaveValue("i");
  });
});
