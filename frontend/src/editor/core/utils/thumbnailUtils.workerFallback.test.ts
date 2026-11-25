// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// Thumbnails render in the worker where it runs; if it cannot start, the same
// request renders on the main thread rather than leaving the file blank.

const renderFirstPageInWorker = vi.hoisted(() => vi.fn());
const renderPdfiumFirstPage = vi.hoisted(() => vi.fn());
vi.mock("@editor/services/pdfRenderWorkerClient", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@editor/services/pdfRenderWorkerClient")
  >()),
  canRenderInWorker: () => true,
  renderFirstPageInWorker,
}));
vi.mock("@editor/utils/pdfiumPageRender", () => ({ renderPdfiumFirstPage }));
vi.mock("@editor/services/pdfiumService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@editor/services/pdfiumService")>()),
  openRawDocumentSafe: vi.fn().mockResolvedValue(1),
  closeRawDocument: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@editor/services/documentBytesCache", () => ({
  getDocumentBytes: async (blob: Blob) => blob.arrayBuffer(),
}));

import { RenderWorkerUnavailable } from "@editor/services/pdfRenderWorkerClient";
import { generateThumbnailPairWithMetadata } from "@editor/utils/thumbnailUtils";

const rendered = (label: string) => ({
  pageCount: 2,
  thumbnails: { unrotated: `${label}-up`, rotated: `${label}-rot` },
  pageRotations: [0, 90],
  pageDimensions: [
    { width: 10, height: 20 },
    { width: 20, height: 10 },
  ],
});
const pdf = () =>
  new File(["%PDF-1.7 fine"], "doc.pdf", { type: "application/pdf" });

beforeEach(() => {
  renderFirstPageInWorker.mockReset();
  renderPdfiumFirstPage.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("file thumbnails when the render worker cannot start", () => {
  it("render on the main thread instead", async () => {
    renderFirstPageInWorker.mockRejectedValue(
      new RenderWorkerUnavailable(new Error("blocked")),
    );
    renderPdfiumFirstPage.mockResolvedValue(rendered("main"));

    const { unrotated, rotated } =
      await generateThumbnailPairWithMetadata(pdf());

    expect(unrotated.thumbnail).toBe("main-up");
    expect(rotated.thumbnail).toBe("main-rot");
    expect(unrotated.pageRotations).toEqual([0, 90]);
  });

  it("use the worker's result when it runs", async () => {
    renderFirstPageInWorker.mockResolvedValue(rendered("worker"));

    const { rotated } = await generateThumbnailPairWithMetadata(pdf());

    expect(rotated.thumbnail).toBe("worker-rot");
    expect(renderPdfiumFirstPage).not.toHaveBeenCalled();
  });
});
