import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FileId } from "@app/types/file";

const mocks = vi.hoisted(() => ({
  openRawDocumentSafe: vi.fn(),
  closeRawDocument: vi.fn(),
  renderPdfiumPageDataUrl: vi.fn(),
}));

vi.mock("@app/services/pdfiumService", () => ({
  openRawDocumentSafe: mocks.openRawDocumentSafe,
  closeRawDocument: mocks.closeRawDocument,
}));

vi.mock("@app/utils/pdfiumPageRender", () => ({
  renderPdfiumPageDataUrl: mocks.renderPdfiumPageDataUrl,
}));

import { ThumbnailGenerationService } from "@app/services/thumbnailGenerationService";

const fileId = (value: string): FileId => value as FileId;

// The cache limits and the two cache methods under test are private; reaching
// them directly is what lets a test pin a document or inspect an eviction
// without standing up the rendering pipeline around it.
interface ServiceInternals {
  maxPdfCacheSize: number;
  pdfDocumentCache: Map<FileId, { docPtr: number; refCount: number }>;
  getCachedPDFDocument(fileId: FileId, buffer: ArrayBuffer): Promise<number>;
  releasePDFDocument(fileId: FileId): void;
}

const internalsOf = (service: ThumbnailGenerationService): ServiceInternals =>
  service as unknown as ServiceInternals;

const buffer = new ArrayBuffer(16);

describe("ThumbnailGenerationService", () => {
  let nextDocPtr = 0;

  beforeEach(() => {
    nextDocPtr = 0;
    mocks.openRawDocumentSafe.mockReset();
    mocks.openRawDocumentSafe.mockImplementation(async () => ++nextDocPtr);
    mocks.closeRawDocument.mockReset();
    mocks.renderPdfiumPageDataUrl.mockReset();
    mocks.renderPdfiumPageDataUrl.mockResolvedValue(
      "data:image/jpeg;base64,AAAA",
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("evicts a document even when every cached timestamp is identical", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-12T10:00:00.000Z"));

    const service = new ThumbnailGenerationService();
    const internals = internalsOf(service);
    internals.maxPdfCacheSize = 2;

    for (const id of [fileId("a"), fileId("b")]) {
      await internals.getCachedPDFDocument(id, buffer);
      // Eviction only considers unreferenced documents.
      internals.releasePDFDocument(id);
    }

    await internals.getCachedPDFDocument(fileId("c"), buffer);

    expect(internals.pdfDocumentCache.size).toBeLessThanOrEqual(2);
    expect(mocks.closeRawDocument).toHaveBeenCalledTimes(1);
  });

  it("keeps the cache bounded when a pinned document leaves nothing to evict", async () => {
    const service = new ThumbnailGenerationService();
    const internals = internalsOf(service);
    internals.maxPdfCacheSize = 1;

    await internals.getCachedPDFDocument(fileId("pinned"), buffer);
    const secondPtr = await internals.getCachedPDFDocument(
      fileId("other"),
      buffer,
    );

    expect(secondPtr).toBeTypeOf("number");
    expect(internals.pdfDocumentCache.has(fileId("pinned"))).toBe(true);
    expect(internals.pdfDocumentCache.size).toBe(2);
  });

  it("releases the document when the progress callback throws", async () => {
    const service = new ThumbnailGenerationService();
    const internals = internalsOf(service);
    const id = fileId("throwing-progress");

    await expect(
      service.generateThumbnails(id, buffer, [1, 2], {}, () => {
        throw new Error("progress exploded");
      }),
    ).rejects.toThrow("progress exploded");

    expect(internals.pdfDocumentCache.has(id)).toBe(false);
    expect(mocks.closeRawDocument).toHaveBeenCalledTimes(1);
  });
});
