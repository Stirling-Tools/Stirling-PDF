/**
 * The File to put in a multipart body when the caller's File may have come back
 * from IndexedDB.
 *
 * WebKit stamps a File restored from IndexedDB with a disk path into its own
 * storage folder, and its form serialiser reads any File with a path from disk.
 * Since Safari 26.5 the process doing the upload may not read that folder, so
 * the request goes out with Content-Length 0 and no error, while the same File
 * reads its bytes fine in JavaScript (https://bugs.webkit.org/show_bug.cgi?id=319985).
 * The server sees a multipart request with no boundary and rejects it before
 * any controller runs.
 *
 * A File built over another File has no path, so every engine serialises it
 * through the blob route, which is also the route WebKit takes for a File it
 * never gave a path. That makes this wrapper correct on every browser today and
 * after the upstream fix lands, whichever shape that fix takes. It references
 * the bytes rather than copying them, so it is safe for arbitrarily large files,
 * and it stays uploadable after the record it came from is rewritten or deleted.
 */
export function uploadableFile(file: File): File {
  return new File([file], file.name, {
    type: file.type,
    lastModified: file.lastModified,
  });
}
