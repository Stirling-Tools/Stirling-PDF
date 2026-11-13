import { MantineProvider } from "@mantine/core";
import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PageView } from "@editor/tools/pdfTextEditor/components/PageView";
import { Page } from "@editor/tools/pdfTextEditor/model/Page";
import { PdfiumPageRenderer } from "@editor/tools/pdfTextEditor/pdfium/PdfiumPageRenderer";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
import type { PageSnapshot } from "@editor/tools/pdfTextEditor/types";

vi.mock("@editor/tools/pdfTextEditor/components/TableOverlay", () => ({
  TableOverlay: () => null,
}));

class VisibleObserver {
  constructor(private readonly callback: IntersectionObserverCallback) {}
  observe(target: Element): void {
    this.callback(
      [{ isIntersecting: true, target } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
  disconnect(): void {}
  unobserve(): void {}
}

function snapshot(live: Page): PageSnapshot {
  return {
    pageIndex: 0,
    width: live.width,
    height: live.height,
    dirty: false,
    revision: live.revision,
    runs: [],
    images: [],
    shapes: [],
    display: live.display.toData(),
  };
}

function view(live: Page, document: EditorDocument) {
  return (
    <MantineProvider env="test">
      <PageView
        document={document}
        store={{} as EditorStore}
        page={snapshot(live)}
        scale={1}
        widthMode="grow"
        selectedRunIds={[]}
        selectedImageIds={[]}
        selectedShapeIds={[]}
        onSelectRun={() => {}}
        onSelectImage={() => {}}
        onSelectShape={() => {}}
        onEditRun={() => {}}
      />
    </MantineProvider>
  );
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
    const document = { page: () => live } as unknown as EditorDocument;
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

    const from = live.revision;
    live.markDirty();
    live.noteRepaintArea(from, live.revision, {
      x: 10,
      y: 10,
      width: 20,
      height: 20,
    });
    rerender(view(live, document));

    await waitFor(() => expect(renderPage).toHaveBeenCalledTimes(2));
    expect(renderArea).toHaveBeenCalledTimes(1);
  });

  it("takes the error away once an edit's area redraws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const live = new Page({ index: 0, pagePtr: 1, width: 600, height: 800 });
    const document = { page: () => live } as unknown as EditorDocument;
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
    const edit = () => {
      const from = live.revision;
      live.markDirty();
      live.noteRepaintArea(from, live.revision, {
        x: 10,
        y: 10,
        width: 20,
        height: 20,
      });
    };

    const { rerender, queryByTestId } = render(view(live, document));
    await waitFor(() => expect(renderPage).toHaveBeenCalledTimes(1));
    edit();
    rerender(view(live, document));
    await waitFor(() =>
      expect(queryByTestId("pdf-editor-page-0-error")).not.toBeNull(),
    );

    edit();
    rerender(view(live, document));

    await waitFor(() => expect(renderArea).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(queryByTestId("pdf-editor-page-0-error")).toBeNull(),
    );
    warn.mockRestore();
  });
});
