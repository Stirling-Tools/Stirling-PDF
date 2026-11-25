/**
 * Clearers for module-level caches keyed by PDFium page, font or object
 * pointers. Closing a document frees its pointers and PDFium hands the same
 * addresses to the next document, so an entry that outlives its document
 * answers for whatever page or font takes its address.
 *
 * Imports nothing, so any cache module can register without an import cycle
 * through EditorDocument.
 */
const clearers = new Set<() => void>();

/** Run `clear` whenever a document closes; a cache module calls this once at load. */
export function clearOnDocumentClose(clear: () => void): void {
  clearers.add(clear);
}

/** Called by EditorDocument.dispose once its pages and document are closed. */
export function documentClosed(): void {
  for (const clear of clearers) clear();
}
