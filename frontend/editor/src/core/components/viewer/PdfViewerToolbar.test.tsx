import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PdfViewerToolbar } from "@app/components/viewer/PdfViewerToolbar";

const viewer = vi.hoisted(() => ({
  currentPage: 2,
  totalPages: 3,
  scrollToPage: vi.fn(),
}));

vi.mock("@app/contexts/ViewerContext", () => ({
  useViewer: () => ({
    getScrollState: () => ({
      currentPage: viewer.currentPage,
      totalPages: viewer.totalPages,
    }),
    getZoomState: () => ({ zoomPercent: 100 }),
    getSpreadState: () => ({ isDualPage: false }),
    scrollActions: {
      scrollToPage: viewer.scrollToPage,
      scrollToFirstPage: vi.fn(),
      scrollToLastPage: vi.fn(),
    },
    zoomActions: { zoomIn: vi.fn(), zoomOut: vi.fn(), setZoomLevel: vi.fn() },
    spreadActions: { toggleSpreadMode: vi.fn() },
    zoomRestorePendingRef: { current: false },
    zoomRestoreSettledTick: 0,
    registerImmediateZoomUpdate: () => () => {},
    registerImmediateScrollUpdate: () => () => {},
    registerImmediateSpreadUpdate: () => () => {},
    pdfRenderMode: "canvas",
    cyclePdfRenderMode: vi.fn(),
  }),
}));
vi.mock("@app/hooks/useIsMobile", () => ({ useIsPhone: () => false }));

beforeEach(() => {
  viewer.currentPage = 2;
  viewer.totalPages = 3;
  viewer.scrollToPage.mockClear();
});
afterEach(cleanup);

// `/PageLabels` can carry entries without `/S` or `/P`, which `getPageLabels`
// reports as "", so those pages must still show their index.
it("falls back to the page index for an unlabelled current page", () => {
  render(
    <MantineProvider>
      <PdfViewerToolbar pageLabels={["i", "", "iii"]} />
    </MantineProvider>,
  );

  expect(screen.getByRole("textbox")).toHaveValue("2");
  expect(screen.getByText("/ iii")).toBeInTheDocument();
});

it("falls back to the page index for an unlabelled last page", () => {
  render(
    <MantineProvider>
      <PdfViewerToolbar pageLabels={["i", "ii", ""]} />
    </MantineProvider>,
  );

  expect(screen.getByRole("textbox")).toHaveValue("ii");
  expect(screen.getByText("/ 3")).toBeInTheDocument();
});

// A restarted numbering makes page 2 carry the same label as page 1; blurring
// the unchanged field must keep the current page, not resolve the duplicate to
// the first occurrence.
it("keeps the current page when its repeated label is committed unchanged", () => {
  render(
    <MantineProvider>
      <PdfViewerToolbar pageLabels={["1", "1", "2"]} />
    </MantineProvider>,
  );

  const input = screen.getByRole("textbox");
  expect(input).toHaveValue("1");

  fireEvent.blur(input);

  expect(viewer.scrollToPage).not.toHaveBeenCalled();
});

it("keeps the index path open for a later duplicate label", () => {
  viewer.currentPage = 1;
  render(
    <MantineProvider>
      <PdfViewerToolbar pageLabels={["1", "2", "1"]} />
    </MantineProvider>,
  );

  const input = screen.getByRole("textbox");
  fireEvent.change(input, { target: { value: "3" } });
  fireEvent.blur(input);

  expect(viewer.scrollToPage).toHaveBeenCalledWith(3);
});

it("navigates to a different label", () => {
  render(
    <MantineProvider>
      <PdfViewerToolbar pageLabels={["i", "ii", "iii"]} />
    </MantineProvider>,
  );

  const input = screen.getByRole("textbox");
  fireEvent.change(input, { target: { value: "iii" } });
  fireEvent.blur(input);
  expect(viewer.scrollToPage).toHaveBeenCalledWith(3);
});
