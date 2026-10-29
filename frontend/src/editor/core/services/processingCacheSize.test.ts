import { describe, expect, it } from "vitest";
import { ProcessingCache } from "@editor/services/processingCache";
import type { ProcessedFile } from "@editor/types/processing";

function fileWithThumbs(thumbBytes: number, pages: number): ProcessedFile {
  return {
    id: "f",
    pages: Array.from({ length: pages }, (_, i) => ({
      id: `p-${i}`,
      pageNumber: i + 1,
      thumbnail: "x".repeat(thumbBytes),
      rotation: 0,
      selected: false,
    })),
    totalPages: pages,
    metadata: {
      title: "f",
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
    },
  };
}

describe("ProcessingCache size accounting", () => {
  it("measures actual thumbnail bytes instead of a fixed estimate", () => {
    const cache = new ProcessingCache({
      maxFiles: 20,
      maxSizeBytes: 2 * 1024 * 1024,
      ttlMs: 60_000,
    });
    cache.set("a", fileWithThumbs(1_490_000, 1));
    expect(cache.getStats().totalSizeBytes).toBeGreaterThan(1_490_000);
  });

  it("does not double-count a replacement for an existing key", () => {
    const cache = new ProcessingCache({
      maxFiles: 20,
      maxSizeBytes: 2 * 1024 * 1024,
      ttlMs: 60_000,
    });

    cache.set("a", fileWithThumbs(900_000, 1));
    cache.set("a", fileWithThumbs(900_000, 1));

    expect(cache.getStats().totalSizeBytes).toBeLessThan(1_000_000);
  });

  it("rejects an entry larger than the whole cache", () => {
    const cache = new ProcessingCache({
      maxFiles: 20,
      maxSizeBytes: 1_000,
      ttlMs: 60_000,
    });

    cache.set("huge", fileWithThumbs(2_000, 1));

    expect(cache.has("huge")).toBe(false);
    expect(cache.getStats().totalSizeBytes).toBe(0);
  });

  it("evicts when real bytes exceed the cap", () => {
    const cache = new ProcessingCache({
      maxFiles: 20,
      maxSizeBytes: 2 * 1024 * 1024,
      ttlMs: 60_000,
    });
    cache.set("a", fileWithThumbs(1_490_000, 1));
    cache.set("b", fileWithThumbs(1_490_000, 1));
    const stats = cache.getStats();
    expect(stats.totalSizeBytes).toBeLessThanOrEqual(2 * 1024 * 1024);
    expect(cache.has("a") || cache.has("b")).toBe(true);
  });
});
