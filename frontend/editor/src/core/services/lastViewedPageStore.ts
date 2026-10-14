/**
 * Last page viewed per file, keyed by FileId. Kept apart from the file's
 * IndexedDB record because updating that record rewrites the file's bytes with
 * it, which is too costly to repeat as the reader scrolls.
 */
const STORAGE_KEY = "stirling.viewer.lastViewedPage";
// Entries for deleted files are never removed, so the oldest are evicted instead.
const MAX_ENTRIES = 500;

function readPages(): Record<string, number> {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? "{}",
    );
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, number>)
      : {};
  } catch {
    return {};
  }
}

/** 1-based page, or null when none past the first is remembered. */
export function getLastViewedPage(fileId: string): number | null {
  const page = readPages()[fileId];
  return Number.isInteger(page) && page > 1 ? page : null;
}

export function setLastViewedPage(fileId: string, page: number): void {
  const pages = readPages();
  // Re-inserting moves the file to the newest end of the eviction order.
  delete pages[fileId];
  if (page > 1) pages[fileId] = page;
  const ids = Object.keys(pages);
  for (const id of ids.slice(0, Math.max(0, ids.length - MAX_ENTRIES))) {
    delete pages[id];
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pages));
  } catch {
    // Storage unavailable: the position is not remembered.
  }
}
