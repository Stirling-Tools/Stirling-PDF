import { describe, expect, it } from "vitest";
import { ThumbnailGenerationService } from "@app/services/thumbnailGenerationService";

function makeService(): ThumbnailGenerationService {
  return new ThumbnailGenerationService(1);
}

describe("thumbnail cache bounds", () => {
  it("caps entries at the viewport plus prefetch window", () => {
    const service = makeService();
    for (let i = 0; i < 150; i++) {
      service.addThumbnailToCache(`page-${i}`, `data:image/png;base64,${i}`);
    }
    const stats = service.getCacheStats();
    expect(stats.size).toBeLessThanOrEqual(100);
    expect(service.getThumbnailFromCache("page-0")).toBeNull();
    expect(service.getThumbnailFromCache("page-149")).not.toBeNull();
  });

  it("re-setting the same page does not leak tracked bytes", () => {
    const service = makeService();
    service.addThumbnailToCache("page-1", "data:image/png;base64,aaa");
    const before = service.getCacheStats().sizeBytes;
    service.addThumbnailToCache("page-1", "data:image/png;base64,aaa");
    expect(service.getCacheStats().size).toBe(1);
    expect(service.getCacheStats().sizeBytes).toBe(before);
  });

  it("a cache hit protects the entry from eviction", () => {
    const service = makeService();
    for (let i = 0; i < 100; i++) {
      service.addThumbnailToCache(`page-${i}`, `data:image/png;base64,${i}`);
    }
    expect(service.getThumbnailFromCache("page-0")).not.toBeNull();
    service.addThumbnailToCache("page-100", "data:image/png;base64,new");
    expect(service.getThumbnailFromCache("page-0")).not.toBeNull();
    expect(service.getThumbnailFromCache("page-1")).toBeNull();
  });
});
