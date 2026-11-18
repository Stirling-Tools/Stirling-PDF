import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  pageSnapshot,
  stubDocument,
  stubbedPageView,
  VisibleObserver,
} from "@editor/tools/pdfTextEditor/components/pageViewTestSupport";
import { Page } from "@editor/tools/pdfTextEditor/model/Page";
import { PdfiumPageRenderer } from "@editor/tools/pdfTextEditor/pdfium/PdfiumPageRenderer";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";

vi.mock("@editor/tools/pdfTextEditor/components/TableOverlay", () => ({
  TableOverlay: () => null,
}));

function view(live: Page, document: EditorDocument) {
  return stubbedPageView(document, pageSnapshot(live));
}

function editArea(live: Page): void {
  const from = live.revision;
  live.markDirty();
  live.noteRepaintArea(from, live.revision, {
    x: 10,
    y: 10,
    width: 20,
    height: 20,
  });
}

describe("PageView partial redraw", () => {
  const originalObserver = globalThis.IntersectionObserver;

  beforeEach(() => {
    globalThis.IntersectionObserver =
      VisibleObserver as unknown as typeof IntersectionObserver;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  });

  afterEach(() => {
    globalThis.IntersectionObserver = originalObserver;
    // restoreAllMocks would also strip the setup's matchMedia mock the next render needs.
    for (const spy of [
      HTMLCanvasElement.prototype.getContext,
      PdfiumPageRenderer.render,
      PdfiumPageRenderer.renderArea,
    ])
      if (vi.isMockFunction(spy)) spy.mockRestore();
  });

  it("draws the whole page once when redrawing the edited area fails", async () => {
    const live = new Page({ index: 0, pagePtr: 1, width: 600, height: 800 });
    const document = stubDocument(live);
    const renderPage = vi
      .spyOn(PdfiumPageRenderer, "render")
      .mockImplementation(
        async (_doc, page, scale) =>
          PdfiumPageRenderer.rasterSize(
            page.width,
            page.height,
            scale,
          ) as ImageData,
      );
    const renderArea = vi
      .spyOn(PdfiumPageRenderer, "renderArea")
      .mockRejectedValue(new Error("out of memory"));

    const { rerender } = render(view(live, document));
    await waitFor(() => expect(renderPage).toHaveBeenCalledTimes(1));

    editArea(live);
    rerender(view(live, document));

    await waitFor(() => expect(renderPage).toHaveBeenCalledTimes(2));
    expect(renderArea).toHaveBeenCalledTimes(1);
  });

  it("takes the error away once an edit's area redraws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const live = new Page({ index: 0, pagePtr: 1, width: 600, height: 800 });
    const document = stubDocument(live);
    const size = (scale: number) =>
      PdfiumPageRenderer.rasterSize(
        live.width,
        live.height,
        scale,
      ) as ImageData;
    const renderPage = vi
      .spyOn(PdfiumPageRenderer, "render")
      .mockImplementationOnce(async (_doc, _page, scale) => size(scale))
      .mockRejectedValue(new Error("out of memory"));
    const renderArea = vi
      .spyOn(PdfiumPageRenderer, "renderArea")
      .mockImplementation(
        async (_doc, _page, _scale, area) => area as unknown as ImageData,
      );

    const { rerender, queryByTestId } = render(view(live, document));
    await waitFor(() => expect(renderPage).toHaveBeenCalledTimes(1));
    editArea(live);
    rerender(view(live, document));
    await waitFor(() =>
      expect(queryByTestId("pdf-editor-page-0-error")).not.toBeNull(),
    );

    editArea(live);
    rerender(view(live, document));

    await waitFor(() => expect(renderArea).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(queryByTestId("pdf-editor-page-0-error")).toBeNull(),
    );
    warn.mockRestore();
  });
});
