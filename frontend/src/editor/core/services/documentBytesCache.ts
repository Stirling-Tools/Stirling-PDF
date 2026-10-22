/**
 * One ArrayBuffer per document, shared by the viewer's scans (form fields,
 * signature/button appearances, measurement scales).
 *
 * Callers must not detach the returned buffer: pdf.js transfers whatever it is
 * given, so anything that hands bytes to pdf.js has to pass a URL instead.
 *
 * The buffer is held weakly: a File record pinned by unrelated state (stale
 * React fibers, sidebar metadata) must not keep the whole document resident.
 * Callers that need the bytes hold the buffer they were handed; once nothing
 * does, the next call re-reads the Blob.
 *
 * Entries are keyed by Blob identity, never by file metadata: the local picker
 * hands us documents from disk, and two different files can carry the same name,
 * size, type and mtime (every entry extracted from an archive shares one mtime),
 * so a metadata hit could serve the viewer another document's bytes. A fresh
 * wrapper around the same bytes therefore reads again, which is the price of
 * never rendering the wrong document.
 */
const resolved = new WeakMap<Blob, WeakRef<ArrayBuffer>>();
const pending = new WeakMap<Blob, Promise<ArrayBuffer>>();

/** Drops the cached entry, e.g. for a large document whose worker copy is up. */
export function releaseDocumentBytes(blob: Blob): void {
  resolved.delete(blob);
  pending.delete(blob);
}

export function getDocumentBytes(blob: Blob): Promise<ArrayBuffer> {
  const alive = resolved.get(blob)?.deref();
  if (alive) return Promise.resolve(alive);

  const inFlight = pending.get(blob);
  if (inFlight) return inFlight;

  const reading = blob.arrayBuffer().then(
    (buffer) => {
      resolved.set(blob, new WeakRef(buffer));
      pending.delete(blob);
      return buffer;
    },
    (error: unknown) => {
      pending.delete(blob);
      throw error;
    },
  );
  pending.set(blob, reading);
  return reading;
}
