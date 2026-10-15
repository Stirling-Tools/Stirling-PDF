import type { FileId } from "@app/types/file";

/**
 * Last page viewed per file, keyed by quickKey so a file reopened from disk
 * under a new FileId still restores. Kept apart from the file's IndexedDB
 * record because updating that record rewrites the file's bytes with it, which
 * is too costly to repeat as the reader scrolls.
 *
 * <p>An entry lives as long as its file: deleting the stored record forgets
 * it, a new version or a rename moves it to the new quickKey, and clearing all
 * data or signing out drops the lot.
 */
const STORAGE_KEY = "stirling.viewer.lastViewedPage";
// Backstop for entries whose file left without passing through fileStorage.
const MAX_ENTRIES = 500;

/** The file a position belongs to. A StirlingFile satisfies it. */
export interface LastViewedFile {
  fileId: FileId;
  quickKey: string;
}

/** fileId is the record last seen at this quickKey, so a delete can find its
 *  entry without reading the record back. */
interface Entry {
  page: number;
  fileId: string;
}

// Signing out tears the viewer down, and that teardown flushes the page being
// read, recreating an entry the sign-out just cleared.
let writesSuspended = false;

function isEntry(value: unknown): value is Entry {
  return (
    typeof value === "object" &&
    value !== null &&
    "page" in value &&
    Number.isInteger(value.page) &&
    "fileId" in value &&
    typeof value.fileId === "string"
  );
}

function readEntries(): Map<string, Entry> {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? "{}",
    );
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return new Map();
    }
    return new Map(
      Object.entries(parsed).filter((pair): pair is [string, Entry] =>
        isEntry(pair[1]),
      ),
    );
  } catch {
    return new Map();
  }
}

function writeEntries(entries: Map<string, Entry>): void {
  if (writesSuspended) return;
  // Insertion order is the eviction order: the oldest entries come first.
  const keys = [...entries.keys()];
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) {
    entries.delete(key);
  }
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(Object.fromEntries(entries)),
    );
  } catch {
    // Storage unavailable: the position is not remembered.
  }
}

/** 1-based page, or null when none past the first is remembered. */
export function getLastViewedPage(quickKey: string): number | null {
  const page = readEntries().get(quickKey)?.page;
  return page !== undefined && page > 1 ? page : null;
}

/** Page 1 forgets the file, since that is where it opens anyway. */
export function setLastViewedPage(file: LastViewedFile, page: number): void {
  const entries = readEntries();
  // Re-inserting moves the file to the newest end of the eviction order.
  entries.delete(file.quickKey);
  if (page > 1) entries.set(file.quickKey, { page, fileId: file.fileId });
  writeEntries(entries);
}

/**
 * Carries a position to the file that now holds it: the same record renamed or
 * reloaded, or a new version replacing it. A position already recorded for the
 * new key is newer, so it is kept.
 */
export function moveLastViewedPage(fromKey: string, to: LastViewedFile): void {
  const entries = readEntries();
  const entry = entries.get(fromKey);
  if (!entry) return;
  entries.delete(fromKey);
  const kept = entries.get(to.quickKey);
  entries.delete(to.quickKey);
  entries.set(to.quickKey, kept ?? { page: entry.page, fileId: to.fileId });
  writeEntries(entries);
}

/** Forgets the positions last recorded for these records. */
export function forgetLastViewedPages(fileIds: Iterable<string>): void {
  const doomed = new Set(fileIds);
  const entries = readEntries();
  let changed = false;
  for (const [quickKey, entry] of entries) {
    if (!doomed.has(entry.fileId)) continue;
    entries.delete(quickKey);
    changed = true;
  }
  if (changed) writeEntries(entries);
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

/** A fresh viewer mount, or a sign-out that failed, means recording again. */
export function resumeLastViewedPages(): void {
  writesSuspended = false;
}
