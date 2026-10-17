import { MantineProvider } from "@mantine/core";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PdfViewerToolbar } from "@app/components/viewer/PdfViewerToolbar";

const viewer = vi.hoisted(() => ({
  currentPage: 2,
  totalPages: 3,
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
      scrollToPage: vi.fn(),
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
