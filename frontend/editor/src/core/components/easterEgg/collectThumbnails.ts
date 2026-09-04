import type { StirlingFileStub } from "@app/types/fileContext";

/** The wall is 13x3, so more thumbnails than that would never be seen. */
export const MAX_THUMBNAILS = 39;
export interface ThumbnailRequest {
  /** Index into the file list this plan was built from. */
  fileIndex: number;
  /** 1-based, as the thumbnail service expects. */
  pageNumber: number;
  /** Already generated and reusable; absent means it has to be rendered. */
  existing?: string;
}

/** How many pages a stub is known to have, as far as the app has worked out. */
function knownPageCount(stub: StirlingFileStub): number {
  const pages = stub.processedFile?.pages;
  if (pages && pages.length > 0) return pages.length;
  const total = stub.processedFile?.totalPages;
  if (typeof total === "number" && total > 0) return total;
  // Nothing has looked at the file yet; its own thumbnail is all there is.
  return 1;
}

/**
 * Plans which page of which file faces each brick.
 *
 * Requests are interleaved, one page from each file in turn: taken depth-first
 * a single long document fills the whole wall and every other open file goes
 * unseen. A page the app has already rendered is reused; the rest are left for
 * the caller to generate, because in practice almost nothing is pre-rendered -
 * page thumbnails only exist once something like the page editor has asked for
 * them, so a freshly opened file offers at most one image for the whole wall.
 */
export function planThumbnails(
  stubs: readonly StirlingFileStub[],
  max: number = MAX_THUMBNAILS,
): ThumbnailRequest[] {
  // No per-file cap: the interleaving already keeps one document from crowding
  // the others out, and capping per file only cost variety when few are open.
  // Total work stays bounded by `max`.
  const depths = stubs.map((stub) => Math.min(knownPageCount(stub), max));
  const deepest = depths.reduce((n, d) => Math.max(n, d), 0);

  const plan: ThumbnailRequest[] = [];
  const seen = new Set<string>();
  for (let page = 1; page <= deepest; page++) {
    for (const [fileIndex, stub] of stubs.entries()) {
      if (page > depths[fileIndex]) continue;
      const pageThumb = stub.processedFile?.pages?.[page - 1]?.thumbnail;
      // The file's own thumbnail stands in for its first page only.
      const existing =
        pageThumb ?? (page === 1 ? stub.thumbnailUrl : undefined);
      // The same image twice would waste a brick on a repeat.
      if (existing && seen.has(existing)) continue;
      if (existing) seen.add(existing);
      plan.push({ fileIndex, pageNumber: page, existing });
      if (plan.length >= max) return plan;
    }
  }
  return plan;
}
