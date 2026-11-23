import { describe, expect, it } from "vitest";
import { ThumbnailGenerationService } from "@editor/services/thumbnailGenerationService";
import type { FileId } from "@editor/types/file";

// Page thumbnails outlive the editor view but must not outlive their file:
// closing one drops its pages and nothing else.

describe("ThumbnailGenerationService.forgetFile", () => {
  it("drops only the closed file's thumbnails and their accounted size", () => {
    const service = new ThumbnailGenerationService();
    service.addThumbnailToCache("a@1#1", "data:a1", "a");
    service.addThumbnailToCache("a@1#2", "data:a2", "a");
    service.addThumbnailToCache("b@1#1", "data:b1", "b");
    service.addThumbnailToCache("preview", "data:p");

    service.forgetFile("a" as FileId);

    expect(service.getThumbnailFromCache("a@1#1")).toBeNull();
    expect(service.getThumbnailFromCache("a@1#2")).toBeNull();
    expect(service.getThumbnailFromCache("b@1#1")).toBe("data:b1");
    expect(service.getThumbnailFromCache("preview")).toBe("data:p");
    expect(service.getCacheStats()).toMatchObject({
      size: 2,
      sizeBytes: ("data:b1".length + "data:p".length) * 2,
    });
  });
});
