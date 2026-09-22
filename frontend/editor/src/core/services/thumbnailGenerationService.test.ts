import { describe, it, expect, beforeEach } from "vitest";
import { ThumbnailGenerationService } from "@app/services/thumbnailGenerationService";

describe("ThumbnailGenerationService - Cache Management", () => {
  let service: ThumbnailGenerationService;

  beforeEach(() => {
    service = new ThumbnailGenerationService();
  });

  it("stores and retrieves thumbnails from cache", () => {
    service.addThumbnailToCache("page-1", "data:image/jpeg;base64,thumb1");
    expect(service.getThumbnailFromCache("page-1")).toBe("data:image/jpeg;base64,thumb1");
    expect(service.getThumbnailFromCache("page-2")).toBeNull();
  });

  it("evicts least recently used thumbnails when exceeding max cache size", () => {
    // Override maxCacheSizeBytes for testing eviction
    (service as unknown as { maxCacheSizeBytes: number }).maxCacheSizeBytes = 100;

    // Each string of length 20 takes 40 bytes (length * 2)
    service.addThumbnailToCache("page-1", "12345678901234567890");
    service.addThumbnailToCache("page-2", "12345678901234567890");

    // Access page-1 to make it more recently used than page-2
    expect(service.getThumbnailFromCache("page-1")).toBe("12345678901234567890");

    // Adding page-3 (40 bytes) exceeds 100 bytes limit (40 + 40 + 40 = 120 > 100)
    // page-2 should be evicted because page-1 was accessed more recently
    service.addThumbnailToCache("page-3", "12345678901234567890");

    expect(service.getThumbnailFromCache("page-2")).toBeNull();
    expect(service.getThumbnailFromCache("page-1")).toBe("12345678901234567890");
    expect(service.getThumbnailFromCache("page-3")).toBe("12345678901234567890");
  });

  it("clears cache completely", () => {
    service.addThumbnailToCache("page-1", "data:thumb");
    service.clearCache();
    expect(service.getThumbnailFromCache("page-1")).toBeNull();
    expect(service.getCacheStats().size).toBe(0);
    expect(service.getCacheStats().sizeBytes).toBe(0);
  });
});
