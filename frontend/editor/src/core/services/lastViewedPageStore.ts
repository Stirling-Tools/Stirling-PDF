/**
 * Last page viewed per file, keyed by quickKey. Kept apart from the file's
 * IndexedDB record because updating that record rewrites the file's bytes with
 * it, which is too costly to repeat as the reader scrolls.
 *
 * <p>An entry lives as long as its file: deleting the stored record forgets
 * it, a new version or a rename moves it to the new quickKey, and clearing all
 * data or signing out drops the lot.
 */
const STORAGE_KEY = "stirling.viewer.lastViewedPage";
// Backstop for entries whose file left without passing through fileStorage.
const MAX_ENTRIES = 500;

// Signing out tears the viewer down, and that teardown flushes the page being
// read, recreating an entry the sign-out just cleared.
let writesSuspended = false;

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

function writePages(pages: Record<string, number>): void {
  if (writesSuspended) return;
  // Object keys keep insertion order, so the oldest entries come first.
  const keys = Object.keys(pages);
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) {
    delete pages[key];
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pages));
  } catch {
    // Storage unavailable: the position is not remembered.
  }
}

/** 1-based page, or null when none past the first is remembered. */
export function getLastViewedPage(fileKey: string): number | null {
  const page = readPages()[fileKey];
  return Number.isInteger(page) && page > 1 ? page : null;
}

/** Page 1 forgets the file, since that is where it opens anyway. */
export function setLastViewedPage(fileKey: string, page: number): void {
  const pages = readPages();
  // Re-inserting moves the file to the newest end of the eviction order.
  delete pages[fileKey];
  if (page > 1) pages[fileKey] = page;
  writePages(pages);
}

/**
 * Carries a file's position to the quickKey it now goes by, after a rename or
 * a new version. A position already recorded under the new key is newer, so it
 * is kept.
 */
export function moveLastViewedPage(fromKey: string, toKey: string): void {
  if (fromKey === toKey) return;
  const pages = readPages();
  const page = pages[fromKey];
  if (page === undefined) return;
  delete pages[fromKey];
  if (pages[toKey] === undefined) pages[toKey] = page;
  writePages(pages);
}

export function forgetLastViewedPages(fileKeys: Iterable<string>): void {
  const pages = readPages();
  let changed = false;
  for (const fileKey of fileKeys) {
    if (pages[fileKey] === undefined) continue;
    delete pages[fileKey];
    changed = true;
  }
  if (changed) writePages(pages);
}

export function clearLastViewedPages(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Unwritable store; nothing a later read could trust anyway.
  }
}

/** Sign-out: forget every position and stop recording until the viewer mounts again. */
export function suspendLastViewedPages(): void {
  writesSuspended = true;
  clearLastViewedPages();
}

/** A fresh viewer mount is a new session, so recording starts again. */
export function resumeLastViewedPages(): void {
  writesSuspended = false;
}
