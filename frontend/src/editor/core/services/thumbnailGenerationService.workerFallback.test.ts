import { describe, expect, it, vi } from "vitest";

// Page thumbnails fall back to the main thread when the render worker cannot
// start; any other failure is reported, not retried.

const renderPagesInWorker = vi.hoisted(() => vi.fn());
vi.mock("@editor/services/pdfRenderWorkerClient", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@editor/services/pdfRenderWorkerClient")
  >()),
  canRenderInWorker: () => true,
  renderPagesInWorker,
}));

import { RenderWorkerUnavailable } from "@editor/services/pdfRenderWorkerClient";
import { ThumbnailGenerationService } from "@editor/services/thumbnailGenerationService";
import type { FileId } from "@editor/types/file";

const mainThreadResult = [
  { pageNumber: 1, thumbnail: "data:main", success: true },
];

function serviceWithMainThreadStub() {
  const service = new ThumbnailGenerationService();
  const mainThread = vi
    .spyOn(
      service as unknown as {
        generateThumbnailsMainThread: () => Promise<unknown>;
      },
      "generateThumbnailsMainThread",
    )
    .mockResolvedValue(mainThreadResult);
  return { service, mainThread };
}

describe("page thumbnails when the render worker cannot start", () => {
  it("render on the main thread instead", async () => {
    renderPagesInWorker.mockRejectedValue(
      new RenderWorkerUnavailable(new Error("blocked")),
    );
    const { service, mainThread } = serviceWithMainThreadStub();

    const results = await service.generateThumbnails(
      "f" as FileId,
      new ArrayBuffer(8),
      [1],
    );

    expect(mainThread).toHaveBeenCalled();
    expect(results).toEqual(mainThreadResult);
  });

  it("do not re-render on the main thread after a render error", async () => {
    renderPagesInWorker.mockRejectedValue(new Error("render failed"));
    const { service, mainThread } = serviceWithMainThreadStub();

    await expect(
      service.generateThumbnails("f" as FileId, new ArrayBuffer(8), [1]),
    ).rejects.toThrow("render failed");
    expect(mainThread).not.toHaveBeenCalled();
  });
});
