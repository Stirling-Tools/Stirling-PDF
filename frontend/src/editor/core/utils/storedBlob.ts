/**
 * Blobs that came out of IndexedDB.
 *
 * Chromium registers such a Blob lazily and can drop that registration while
 * the page still holds the Blob. Any Blob built over it after that gets the
 * renderer killed ("Bad blob references in BlobRegistry::Register",
 * crbug.com/392376370), so a stored Blob is read, never sliced or wrapped.
 */
const storedBlobs = new WeakSet<Blob>();

export function markStoredBlob(blob: Blob): void {
  storedBlobs.add(blob);
}

export function isStoredBlob(blob: Blob): boolean {
  return storedBlobs.has(blob);
}

export interface DetachedFileOptions {
  name?: string;
  type?: string;
  lastModified?: number;
  /** Copy an unmarked Blob too, for callers that cannot know where it came from. */
  alwaysCopy?: boolean;
}

/**
 * A File with `source`'s bytes that no Blob of IndexedDB's backs: a stored
 * Blob is copied, anything else is referenced as `new File([source])` would.
 * The copy streams, so it never lands in the JS heap.
 */
export async function detachedFile(
  source: Blob,
  options: DetachedFileOptions = {},
): Promise<File> {
  const name = options.name ?? (source instanceof File ? source.name : "blob");
  const init: FilePropertyBag = {
    type: options.type ?? source.type,
    lastModified:
      options.lastModified ??
      (source instanceof File ? source.lastModified : Date.now()),
  };
  const bytes =
    options.alwaysCopy || isStoredBlob(source)
      ? await copiedBlob(source)
      : source;
  return new File([bytes], name, init);
}

/** Built from the stream on purpose: a Response built from the Blob itself
 *  hands back that same Blob instead of a copy. */
async function copiedBlob(source: Blob): Promise<Blob> {
  if (typeof source.stream !== "function") {
    return new Blob([await source.arrayBuffer()]);
  }
  return new Response(source.stream()).blob();
}

/**
 * `form` with every file entry copied, for transports that build a Request
 * from it: that builds a Blob over each entry, and an entry appended with a
 * filename is a fresh File that no longer carries the stored mark.
 */
export async function detachedFormData(form: FormData): Promise<FormData> {
  const detached = new FormData();
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") {
      detached.append(key, value);
    } else {
      detached.append(
        key,
        await detachedFile(value, { alwaysCopy: true }),
        value.name,
      );
    }
  }
  return detached;
}
