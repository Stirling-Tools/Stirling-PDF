import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { FileId } from "@app/types/file";
import { ThumbnailGenerationService } from "@app/services/thumbnailGenerationService";

const { open, close, render } = vi.hoisted(() => ({
  open: vi.fn(),
  close: vi.fn(),
  render: vi.fn(),
}));
vi.mock("@app/services/pdfiumService", () => ({
  openRawDocumentSafe: open,
  closeRawDocument: close,
}));
vi.mock("@app/utils/pdfiumPageRender", () => ({
  renderPdfiumPageDataUrl: render,
}));

let service: ThumbnailGenerationService;
beforeEach(() => {
  service = new ThumbnailGenerationService();
  let next = 0;
  open.mockReset().mockImplementation(async () => ++next);
  close.mockReset().mockResolvedValue(undefined);
  render.mockReset().mockResolvedValue("image");
});
afterEach(() => service.destroy());
const file = "file" as FileId;

test("concurrent thumbnail requests share one opening document", async () => {
  await Promise.all([
    service.generateThumbnails(file, new ArrayBuffer(8), [1]),
    service.generateThumbnails(file, new ArrayBuffer(8), [2]),
  ]);
  expect(open).toHaveBeenCalledTimes(1);
  expect(close).toHaveBeenCalledTimes(1);
});

test("a throwing progress callback still releases the document", async () => {
  await expect(
    service.generateThumbnails(file, new ArrayBuffer(8), [1], {}, () => {
      throw new Error("view unmounted");
    }),
  ).rejects.toThrow("view unmounted");
  expect(close).toHaveBeenCalledTimes(1);
});

test("replacing a thumbnail counts only its current allocation", () => {
  service.addThumbnailToCache("page", "abc");
  service.addThumbnailToCache("page", "x");
  expect(service.getCacheStats().sizeBytes).toBe(2);
});

test("a thumbnail larger than the budget is not retained", () => {
  Object.assign(service, { maxCacheSizeBytes: 4 });
  service.addThumbnailToCache("page", "abc");
  expect(service.getThumbnailFromCache("page")).toBeNull();
  expect(service.getCacheStats().sizeBytes).toBe(0);
});

test("concurrent openings respect the document limit", async () => {
  const requests = Array.from({ length: 30 }, (_, i) =>
    service.generateThumbnails(`file-${i}` as FileId, new ArrayBuffer(8), [1]),
  );
  await Promise.resolve();
  await Promise.resolve();
  expect(open.mock.calls.length).toBeLessThanOrEqual(10);
  await Promise.all(requests);
  expect(open).toHaveBeenCalledTimes(30);
  expect(close).toHaveBeenCalledTimes(30);
});
