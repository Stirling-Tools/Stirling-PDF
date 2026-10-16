import { describe, expect, it } from "vitest";
import {
  ThumbnailGenerationService,
  thumbnailGenerationService,
} from "@app/services/thumbnailGenerationService";
import { forgetCachedPageImages } from "@app/services/pageImageCache";
import type { FileId } from "@app/types/file";

const fileA = "file-a" as FileId;
const fileB = "file-b" as FileId;
const fileC = "file-c" as FileId;

describe("ThumbnailGenerationService page-image cache", () => {
  it("drops every image of the removed file and keeps the rest", () => {
    const service = new ThumbnailGenerationService();
    service.addThumbnailToCache("p1", "aaa", fileA);
    service.addThumbnailToCache("p2", "bbbb", fileA);
    service.addThumbnailToCache("p3", "ccccc", fileB);

    expect(service.evictThumbnailsForFile(fileA)).toBe(2);
    expect(service.getThumbnailFromCache("p1")).toBeNull();
    expect(service.getThumbnailFromCache("p2")).toBeNull();
    expect(service.getThumbnailFromCache("p3")).toBe("ccccc");
    expect(service.getCacheStats().size).toBe(1);
  });

  it("keeps the byte accounting in step with evictions", () => {
    const service = new ThumbnailGenerationService();
    service.addThumbnailToCache("p1", "aaaa", fileA); // 8 bytes
    service.addThumbnailToCache("p2", "bb", fileB); // 4 bytes

    service.evictThumbnailsForFile(fileA);
    service.addThumbnailToCache("p3", "cc", fileC); // 4 bytes

    expect(service.getCacheStats().sizeBytes).toBe(8);
  });

  it("caps how many pages are cached even when the byte budget allows more", () => {
    const service = new ThumbnailGenerationService();
    for (let i = 0; i < 600; i++) {
      service.addThumbnailToCache(`p${i}`, "x", fileA);
    }

    const stats = service.getCacheStats();
    expect(stats.size).toBe(512);
    expect(stats.sizeBytes).toBeLessThan(stats.maxSizeBytes);
    expect(service.getThumbnailFromCache("p0")).toBeNull();
    expect(service.getThumbnailFromCache("p599")).toBe("x");
  });

  it("leaves images without a recorded file alone", () => {
    const service = new ThumbnailGenerationService();
    service.addThumbnailToCache("p1", "aaa");

    expect(service.evictThumbnailsForFile(fileA)).toBe(0);
    expect(service.getThumbnailFromCache("p1")).toBe("aaa");
  });

  it("prunes the app's cache through the seam the file lifecycle calls", () => {
    thumbnailGenerationService.addThumbnailToCache("seam-p1", "aaa", fileA);
    thumbnailGenerationService.addThumbnailToCache("seam-p2", "bbb", fileB);

    forgetCachedPageImages(fileA);

    expect(thumbnailGenerationService.getThumbnailFromCache("seam-p1")).toBeNull();
    expect(thumbnailGenerationService.getThumbnailFromCache("seam-p2")).toBe("bbb");
  });
});
