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
    vi.restoreAllMocks();
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
});
