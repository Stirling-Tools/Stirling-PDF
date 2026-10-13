import { describe, expect, it } from "vitest";
import { shouldBumpThumbnailTtl } from "@app/services/fileStorage";

const DAY_MS = 24 * 60 * 60 * 1000;
const TTL_MS = 30 * DAY_MS;
const NOW = 1_800_000_000_000;

function record(ageMs: number) {
  return {
    thumbnail: "data:image/jpeg;base64,stub",
    thumbnailStoredAt: NOW - ageMs,
  };
}

describe("shouldBumpThumbnailTtl", () => {
  it("leaves recent thumbnails alone", () => {
    expect(shouldBumpThumbnailTtl(record(DAY_MS), NOW)).toBe(false);
    expect(shouldBumpThumbnailTtl(record(TTL_MS / 2 - 1), NOW)).toBe(false);
  });

  it("re-dates thumbnails past the halfway mark", () => {
    expect(shouldBumpThumbnailTtl(record(TTL_MS / 2), NOW)).toBe(true);
    expect(shouldBumpThumbnailTtl(record(TTL_MS - 1), NOW)).toBe(true);
  });

  it("lets expired thumbnails take the expiry path", () => {
    expect(shouldBumpThumbnailTtl(record(TTL_MS), NOW)).toBe(false);
    expect(shouldBumpThumbnailTtl(record(TTL_MS + DAY_MS), NOW)).toBe(false);
  });

  it("has nothing to bump without a thumbnail or a stored time", () => {
    expect(
      shouldBumpThumbnailTtl(
        { thumbnail: undefined, thumbnailStoredAt: NOW },
        NOW,
      ),
    ).toBe(false);
    expect(
      shouldBumpThumbnailTtl(
        { thumbnail: "x", thumbnailStoredAt: undefined },
        NOW,
      ),
    ).toBe(false);
  });
});
