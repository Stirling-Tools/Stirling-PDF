import { act, render, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  pageSnapshot,
  stubDocument,
  stubbedPageView,
  VisibleObserver,
} from "@editor/tools/pdfTextEditor/components/pageViewTestSupport";
import { useFontEpoch } from "@editor/tools/pdfTextEditor/hooks/useFontEpoch";
import { Page } from "@editor/tools/pdfTextEditor/model/Page";
import { PdfiumPageRenderer } from "@editor/tools/pdfTextEditor/pdfium/PdfiumPageRenderer";
import { resetTextMetricsCache } from "@editor/tools/pdfTextEditor/util/textMetrics";
import type { TextRunSnapshot } from "@editor/tools/pdfTextEditor/types";

vi.mock("@editor/tools/pdfTextEditor/components/TableOverlay", () => ({
  TableOverlay: () => null,
}));

vi.mock(
  "@editor/tools/pdfTextEditor/util/textMetrics",
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    resetTextMetricsCache: vi.fn(),
  }),
);

class FakeFontFaceSet extends EventTarget {
  status: FontFaceSetLoadStatus = "loaded";
  readyReads = 0;
  get ready(): Promise<FontFaceSet> {
    this.readyReads++;
    return Promise.resolve(this as unknown as FontFaceSet);
  }
}

function textRun(i: number): TextRunSnapshot {
  const y = 760 - i * 14;
  return {
    id: `p0-r${i}`,
    pageIndex: 0,
    bounds: { x: 40, y, width: 120, height: 12 },
    matrix: { a: 1, b: 0, c: 0, d: 1, e: 40, f: y },
    text: `Line ${i}`,
    fontId: "base14:Helvetica",
    fontSize: 12,
    fill: { r: 0, g: 0, b: 0, a: 255 },
    fontSubset: false,
  };
}

function view(live: Page, runs: TextRunSnapshot[]) {
  return stubbedPageView(stubDocument(live), pageSnapshot(live, runs));
}

describe("waiting for fonts on a page of many runs", () => {
  const originalObserver = globalThis.IntersectionObserver;
  let fonts: FakeFontFaceSet;

  beforeEach(() => {
    fonts = new FakeFontFaceSet();
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: fonts,
    });
    globalThis.IntersectionObserver =
      VisibleObserver as unknown as typeof IntersectionObserver;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    vi.spyOn(PdfiumPageRenderer, "render").mockImplementation(
      async (_doc, page, scale) =>
        PdfiumPageRenderer.rasterSize(
          page.width,
          page.height,
          scale,
        ) as ImageData,
    );
    vi.mocked(resetTextMetricsCache).mockClear();
  });

  afterEach(() => {
    globalThis.IntersectionObserver = originalObserver;
    Reflect.deleteProperty(document, "fonts");
    for (const spy of [
      HTMLCanvasElement.prototype.getContext,
      PdfiumPageRenderer.render,
    ])
      if (vi.isMockFunction(spy)) spy.mockRestore();
  });

  it("clears the measurements once for the page when fonts finish loading, not once per run", async () => {
    const live = new Page({ index: 0, pagePtr: 1, width: 600, height: 800 });
    const runs = Array.from({ length: 40 }, (_, i) => textRun(i));
    const { unmount } = render(view(live, runs));
    await act(async () => {});
    expect(
      document.querySelectorAll('[data-testid^="pdf-editor-run-"]'),
    ).toHaveLength(40);
    expect(fonts.readyReads).toBeLessThanOrEqual(1);
    vi.mocked(resetTextMetricsCache).mockClear();

    act(() => {
      fonts.dispatchEvent(new Event("loadingdone"));
    });

    expect(resetTextMetricsCache).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("moves every overlay to the new fonts together, and a later one starts there", () => {
    const first = renderHook(() => useFontEpoch());
    const second = renderHook(() => useFontEpoch());
    const before = first.result.current;
    expect(second.result.current).toBe(before);

    act(() => {
      fonts.dispatchEvent(new Event("loadingdone"));
    });

    expect(first.result.current).toBe(before + 1);
    expect(second.result.current).toBe(before + 1);
    expect(resetTextMetricsCache).toHaveBeenCalledTimes(1);
    expect(renderHook(() => useFontEpoch()).result.current).toBe(before + 1);
  });

  it("waits for fonts still loading when the page opens", async () => {
    fonts.status = "loading";
    const { result } = renderHook(() => useFontEpoch());
    const before = result.current;
    await act(async () => {});
    expect(result.current).toBe(before + 1);
    expect(fonts.readyReads).toBe(1);
  });
});
