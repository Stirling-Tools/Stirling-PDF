import { describe, expect, it } from "vitest";
import type { StirlingFileStub } from "@app/types/fileContext";
import {
  MAX_THUMBNAILS,
  planThumbnails,
} from "@app/components/easterEgg/collectThumbnails";

/** Only the thumbnail-bearing fields matter to the planner. */
function stub(options: {
  pages?: (string | undefined)[];
  totalPages?: number;
  thumbnailUrl?: string;
}): StirlingFileStub {
  const hasProcessed =
    options.pages !== undefined || options.totalPages !== undefined;
  return {
    thumbnailUrl: options.thumbnailUrl,
    processedFile: hasProcessed
      ? {
          pages: (options.pages ?? []).map((thumbnail) => ({ thumbnail })),
          totalPages: options.totalPages,
        }
      : undefined,
  } as StirlingFileStub;
}

/** Compact "file:page" view of a plan, for readable expectations. */
const shape = (plan: ReturnType<typeof planThumbnails>) =>
  plan.map((r) => `${r.fileIndex}:${r.pageNumber}`);

describe("planThumbnails", () => {
  it("plans nothing when there are no files", () => {
    expect(planThumbnails([])).toEqual([]);
  });

  it("plans the first page of a file nothing has looked at yet", () => {
    // A freshly opened file has no page data at all, so page 1 is all we know.
    const plan = planThumbnails([stub({})]);
    expect(shape(plan)).toEqual(["0:1"]);
    expect(plan[0].existing).toBeUndefined();
  });

  it("interleaves files so a long document cannot crowd the others out", () => {
    const plan = planThumbnails([
      stub({ totalPages: 4 }),
      stub({ totalPages: 1 }),
      stub({ totalPages: 2 }),
    ]);
    expect(shape(plan)).toEqual([
      "0:1",
      "1:1",
      "2:1",
      "0:2",
      "2:2",
      "0:3",
      "0:4",
    ]);
  });

  it("represents every file even when the wall fills up", () => {
    const plan = planThumbnails([
      stub({ totalPages: 500 }),
      stub({ totalPages: 500 }),
      stub({ totalPages: 500 }),
    ]);
    expect(plan).toHaveLength(MAX_THUMBNAILS);
    const files = new Set(plan.map((r) => r.fileIndex));
    expect([...files].sort()).toEqual([0, 1, 2]);
  });

  it("fills the whole wall from one document when it is the only one open", () => {
    const plan = planThumbnails([stub({ totalPages: 500 })]);
    expect(plan).toHaveLength(MAX_THUMBNAILS);
    // Distinct pages, so the wall is not the same page over and over.
    expect(new Set(plan.map((r) => r.pageNumber)).size).toBe(MAX_THUMBNAILS);
  });

  it("shares the wall out evenly between several documents", () => {
    const plan = planThumbnails([
      stub({ totalPages: 500 }),
      stub({ totalPages: 500 }),
      stub({ totalPages: 500 }),
    ]);
    const perFile = [0, 1, 2].map(
      (i) => plan.filter((r) => r.fileIndex === i).length,
    );
    expect(perFile).toEqual([13, 13, 13]);
  });

  it("reuses a page thumbnail the app has already rendered", () => {
    const plan = planThumbnails([stub({ pages: ["a1", "a2"] })]);
    expect(plan.map((r) => r.existing)).toEqual(["a1", "a2"]);
  });

  it("marks pages with no thumbnail for rendering", () => {
    const plan = planThumbnails([stub({ pages: ["a1", undefined, "a3"] })]);
    expect(shape(plan)).toEqual(["0:1", "0:2", "0:3"]);
    expect(plan.map((r) => r.existing)).toEqual(["a1", undefined, "a3"]);
  });

  it("uses a file's own thumbnail for its first page only", () => {
    const plan = planThumbnails([
      stub({ totalPages: 2, thumbnailUrl: "file-a" }),
    ]);
    expect(plan[0].existing).toBe("file-a");
    expect(plan[1].existing).toBeUndefined();
  });

  it("prefers a page thumbnail over the file's own", () => {
    const plan = planThumbnails([
      stub({ pages: ["a1"], thumbnailUrl: "file-a" }),
    ]);
    expect(plan[0].existing).toBe("a1");
  });

  it("does not spend two bricks on the same image", () => {
    const plan = planThumbnails([
      stub({ pages: ["shared", "a2"] }),
      stub({ pages: ["shared"] }),
    ]);
    expect(plan.map((r) => r.existing)).toEqual(["shared", "a2"]);
  });

  it("honours a caller-supplied cap", () => {
    const plan = planThumbnails([stub({ totalPages: 5 })], 2);
    expect(plan).toHaveLength(2);
  });
});
