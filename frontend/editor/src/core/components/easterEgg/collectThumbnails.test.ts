import { describe, expect, it } from "vitest";
import type { StirlingFileStub } from "@app/types/fileContext";
import {
  MAX_THUMBNAILS,
  collectThumbnailSources,
} from "@app/components/easterEgg/collectThumbnails";

/** Only the two thumbnail-bearing fields matter to the collector. */
function stub(options: {
  pages?: (string | undefined)[];
  thumbnailUrl?: string;
}): StirlingFileStub {
  return {
    thumbnailUrl: options.thumbnailUrl,
    processedFile: options.pages
      ? { pages: options.pages.map((thumbnail) => ({ thumbnail })) }
      : undefined,
  } as StirlingFileStub;
}

describe("collectThumbnailSources", () => {
  it("returns nothing when no file has a thumbnail yet", () => {
    expect(collectThumbnailSources([])).toEqual([]);
    expect(collectThumbnailSources([stub({}), stub({ pages: [] })])).toEqual(
      [],
    );
  });

  it("takes every page of a single document in order", () => {
    const sources = collectThumbnailSources([
      stub({ pages: ["a1", "a2", "a3"] }),
    ]);
    expect(sources).toEqual(["a1", "a2", "a3"]);
  });

  it("interleaves files so a long document cannot crowd the others out", () => {
    const sources = collectThumbnailSources([
      stub({ pages: ["a1", "a2", "a3", "a4"] }),
      stub({ pages: ["b1"] }),
      stub({ pages: ["c1", "c2"] }),
    ]);
    // One page from each file, then back round for the deeper ones.
    expect(sources).toEqual(["a1", "b1", "c1", "a2", "c2", "a3", "a4"]);
  });

  it("represents every file even when the cap is reached", () => {
    const long = Array.from({ length: 100 }, (_, i) => `a${i}`);
    const sources = collectThumbnailSources([
      stub({ pages: long }),
      stub({ pages: ["b1"] }),
      stub({ pages: ["c1"] }),
    ]);
    expect(sources).toHaveLength(MAX_THUMBNAILS);
    expect(sources).toContain("b1");
    expect(sources).toContain("c1");
  });

  it("falls back to a file's own thumbnail until it has been paged out", () => {
    const sources = collectThumbnailSources([
      stub({ thumbnailUrl: "file-a" }),
      stub({ pages: ["b1", "b2"] }),
    ]);
    expect(sources).toEqual(["file-a", "b1", "b2"]);
  });

  it("prefers page thumbnails over the file's own", () => {
    const sources = collectThumbnailSources([
      stub({ pages: ["a1"], thumbnailUrl: "file-a" }),
    ]);
    expect(sources).toEqual(["a1"]);
  });

  it("skips pages with no thumbnail rather than leaving a hole", () => {
    const sources = collectThumbnailSources([
      stub({ pages: ["a1", undefined, "a3"] }),
    ]);
    expect(sources).toEqual(["a1", "a3"]);
  });

  it("does not spend two bricks on the same image", () => {
    const sources = collectThumbnailSources([
      stub({ pages: ["shared", "a2"] }),
      stub({ pages: ["shared"] }),
    ]);
    expect(sources).toEqual(["shared", "a2"]);
  });

  it("honours a caller-supplied cap", () => {
    const sources = collectThumbnailSources(
      [stub({ pages: ["a1", "a2", "a3"] })],
      2,
    );
    expect(sources).toEqual(["a1", "a2"]);
  });
});
