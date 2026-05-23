import { act, fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { PdfViewerToolbar } from "@app/components/viewer/PdfViewerToolbar";

const mockViewer = {
  getScrollState: vi.fn(() => ({ currentPage: 1, totalPages: 5 })),
  getZoomState: vi.fn(() => ({ currentZoom: 1.4, zoomPercent: 140 })),
  getSpreadState: vi.fn(() => ({ isDualPage: false })),
  scrollActions: {
    scrollToPage: vi.fn(),
    scrollToFirstPage: vi.fn(),
    scrollToLastPage: vi.fn(),
  },
  zoomActions: {
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    setZoomLevel: vi.fn(),
  },
  spreadActions: {
    toggleSpreadMode: vi.fn(),
  },
  registerImmediateZoomUpdate: vi.fn(() => vi.fn()),
  registerImmediateScrollUpdate: vi.fn(() => vi.fn()),
  registerImmediateSpreadUpdate: vi.fn(() => vi.fn()),
  pdfRenderMode: "normal",
  cyclePdfRenderMode: vi.fn(),
};

vi.mock("@app/contexts/ViewerContext", () => ({
  useViewer: () => mockViewer,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

vi.mock("@app/components/shared/Tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
}));

const renderToolbar = () =>
  render(
    <MantineProvider>
      <PdfViewerToolbar />
    </MantineProvider>,
  );

const getToolbarElement = () =>
  screen.getByRole("toolbar", { name: "Page and zoom controls" });

describe("PdfViewerToolbar", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 800,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  test("fades out after a short idle period", () => {
    renderToolbar();
    const toolbar = getToolbarElement();

    expect(toolbar).toHaveStyle({ opacity: "1" });

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(toolbar).toHaveStyle({ opacity: "0" });
    expect(toolbar).toHaveStyle({ pointerEvents: "none" });
  });

  test("reappears when the pointer moves near the bottom of the window", () => {
    renderToolbar();
    const toolbar = getToolbarElement();

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(toolbar).toHaveStyle({ opacity: "0" });

    act(() => {
      window.dispatchEvent(
        new MouseEvent("pointermove", { clientY: 760, bubbles: true }),
      );
    });

    expect(toolbar).toHaveStyle({ opacity: "1" });
    expect(toolbar).toHaveStyle({ pointerEvents: "auto" });
  });

  test("stays visible while the pointer is over the toolbar", () => {
    renderToolbar();
    const toolbar = getToolbarElement();

    fireEvent.pointerEnter(toolbar);
    act(() => {
      window.dispatchEvent(
        new MouseEvent("pointermove", { clientY: 760, bubbles: true }),
      );
      vi.advanceTimersByTime(3000);
    });

    expect(toolbar).toHaveStyle({ opacity: "1" });

    fireEvent.pointerLeave(toolbar);
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(toolbar).toHaveStyle({ opacity: "0" });
  });

  test("does not reschedule the hide timer on every pointer move while visible", () => {
    renderToolbar();
    const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");

    act(() => {
      window.dispatchEvent(
        new MouseEvent("pointermove", { clientY: 760, bubbles: true }),
      );
    });

    expect(clearTimeoutSpy).not.toHaveBeenCalled();
  });

  test("stays visible while a toolbar control has focus", () => {
    renderToolbar();
    const toolbar = getToolbarElement();
    const zoomOutButton = screen.getByLabelText("Zoom out");

    fireEvent.focus(zoomOutButton);

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(toolbar).toHaveStyle({ opacity: "1" });
  });

  test("stays visible when focus moves between toolbar controls", () => {
    renderToolbar();
    const toolbar = getToolbarElement();
    const zoomOutButton = screen.getByLabelText("Zoom out");
    const zoomInButton = screen.getByLabelText("Zoom in");

    fireEvent.focus(zoomOutButton);
    fireEvent.blur(zoomOutButton, { relatedTarget: zoomInButton });

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(toolbar).toHaveStyle({ opacity: "1" });
  });

  test("hides after focus leaves the toolbar", () => {
    renderToolbar();
    const toolbar = getToolbarElement();
    const zoomOutButton = screen.getByLabelText("Zoom out");

    fireEvent.focus(zoomOutButton);
    fireEvent.blur(zoomOutButton, { relatedTarget: document.body });

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(toolbar).toHaveStyle({ opacity: "0" });
  });
});
