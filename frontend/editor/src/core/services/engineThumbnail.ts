/**
 * The viewer registers a page-1 renderer for the engine document it has open,
 * so callers that only hold the file id get the worker's thumbnail instead of
 * reading the document on the main thread. The viewer announces which file it
 * is opening and resolves the engine document id once the open completes, so a
 * caller that arrives first can wait for that open instead of racing it.
 *
 * Keyed by file id, not by Blob: the sidebar loads its own File object from
 * storage, and identity/key equality across those copies is not guaranteed.
 */
import type { FileId } from "@app/types/file";

/**
 * Above this, the add path leaves the thumbnail and page count to the viewer's
 * engine render or the lazy sidebar path, instead of reading the whole file on
 * the main thread while the user waits for the open.
 */
export const EAGER_METADATA_MAX_BYTES = 8 * 1024 * 1024;

/**
 * How long a deferred file waits for the viewer to announce an open before it
 * parses the file itself. A file nobody opens pays this once, in the
 * background; the sidebar keeps showing the placeholder it would have anyway.
 */
export const ENGINE_THUMBNAIL_ANNOUNCE_GRACE_MS = 1200;

/**
 * Once the viewer has shown it is opening the file, keep waiting for the engine
 * document this long. Rendering in the worker beats racing the open with a
 * main-thread parse, so the fallback only wins when the open never reports.
 */
const ENGINE_THUMBNAIL_OPEN_CAP_MS = 12_000;

/** Renders page 1 of the open document as a data URL, or null when it cannot. */
type EngineThumbnailRenderer = () => Promise<string | null>;

interface PendingFileOpen {
  promise: Promise<string | null>;
  resolve: (documentId: string | null) => void;
}

const OPEN_ENTRY_LIMIT = 64;

const fileOpens = new Map<FileId, PendingFileOpen>();
const fileDocumentIds = new Map<FileId, string>();
const renderers = new Map<string, EngineThumbnailRenderer>();

function trimOldest<K, V>(map: Map<K, V>): void {
  while (map.size > OPEN_ENTRY_LIMIT) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

/** The viewer is opening this file; callers wait for its document id. */
export function beginViewerFileOpen(fileId: FileId): void {
  if (!fileDocumentIds.has(fileId) && !fileOpens.has(fileId)) {
    let resolve!: (documentId: string | null) => void;
    const promise = new Promise<string | null>((res) => {
      resolve = res;
    });
    fileOpens.set(fileId, { promise, resolve });
    trimOldest(fileOpens);
  }
}

/** The open finished (id) or failed/was abandoned (null). */
export function resolveViewerFileOpen(
  fileId: FileId,
  documentId: string | null,
): void {
  if (documentId) {
    fileDocumentIds.set(fileId, documentId);
    trimOldest(fileDocumentIds);
  }
  fileOpens.get(fileId)?.resolve(documentId);
  fileOpens.delete(fileId);
}

export function registerEngineThumbnailRenderer(
  documentId: string,
  renderer: EngineThumbnailRenderer,
): void {
  renderers.set(documentId, renderer);
}

export function unregisterEngineThumbnailRenderer(documentId: string): void {
  renderers.delete(documentId);
}

/** How often a caller waiting for an open re-checks without one announced. */
const OPEN_POLL_MS = 50;

async function waitForViewerFileOpen(
  fileId: FileId,
  graceMs: number,
): Promise<string | null> {
  let deadline = Date.now() + graceMs;
  let announced = false;
  while (true) {
    const settled = fileDocumentIds.get(fileId);
    if (settled) return settled;
    const pending = fileOpens.get(fileId);
    if (pending) {
      if (!announced) {
        announced = true;
        deadline = Date.now() + ENGINE_THUMBNAIL_OPEN_CAP_MS;
      }
      const documentId = await pending.promise;
      if (documentId) return documentId;
      // The open failed or was abandoned; a retry may still announce.
      continue;
    }
    const now = Date.now();
    if (now >= deadline) return null;
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(OPEN_POLL_MS, deadline - now)),
    );
  }
}

/**
 * The engine-rendered thumbnail for a file the viewer is opening or has open,
 * or null when nobody opens it within `graceMs` or the engine cannot render it,
 * in which case the caller parses the file itself.
 */
export async function getEngineThumbnail(
  fileId: FileId,
  graceMs = 0,
): Promise<string | null> {
  const documentId = await waitForViewerFileOpen(fileId, graceMs);
  if (!documentId) return null;
  const renderer = renderers.get(documentId);
  if (!renderer) return null;
  try {
    return await renderer();
  } catch {
    return null;
  }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
