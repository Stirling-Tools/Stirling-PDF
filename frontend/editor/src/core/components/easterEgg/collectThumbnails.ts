import type { StirlingFileStub } from "@app/types/fileContext";

/** The wall is 13x3, so more thumbnails than that would never be seen. */
export const MAX_THUMBNAILS = 39;

/**
 * Picks the thumbnails to face the game's bricks with.
 *
 * Page thumbnails are preferred, since one document can fill a good part of the
 * wall on its own; a file's own thumbnail stands in for anything not paged out
 * yet. Sources are taken one page from each file in turn rather than file by
 * file: depth-first, a single long document fills the whole wall and every
 * other open file goes unseen.
 */
export function collectThumbnailSources(
  stubs: readonly StirlingFileStub[],
  max: number = MAX_THUMBNAILS,
): string[] {
  const perFile = stubs.map((stub) => {
    const pages = (stub.processedFile?.pages ?? [])
      .map((page) => page.thumbnail)
      .filter((src): src is string => Boolean(src));
    if (pages.length > 0) return pages;
    return stub.thumbnailUrl ? [stub.thumbnailUrl] : [];
  });

  const sources: string[] = [];
  const seen = new Set<string>();
  const deepest = perFile.reduce((n, pages) => Math.max(n, pages.length), 0);
  for (let page = 0; page < deepest; page++) {
    for (const pages of perFile) {
      const src = pages[page];
      // The same blob URL twice would waste a brick on a repeat.
      if (!src || seen.has(src)) continue;
      seen.add(src);
      sources.push(src);
      if (sources.length >= max) return sources;
    }
  }
  return sources;
}
