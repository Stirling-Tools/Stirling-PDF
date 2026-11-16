/**
 * The File to put in a multipart body when the caller's File may have come back
 * from IndexedDB.
 *
 * WebKit serialises such a File by reading the disk path it stamped on it, which
 * since Safari 26.5 the uploading process may not read: the request goes out with
 * Content-Length 0 and no error (https://bugs.webkit.org/show_bug.cgi?id=319985).
 * A File built over another File has no path, so every engine serialises it
 * through the blob route instead. It references the bytes rather than copying
 * them, so it is safe for arbitrarily large files.
 */
export function uploadableFile(file: File): File {
  return new File([file], file.name, {
    type: file.type,
    lastModified: file.lastModified,
  });
}
