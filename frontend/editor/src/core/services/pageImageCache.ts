import type { FileId } from "@app/types/file";

// Dropping a removed file's cached page images needs the page-image cache, but
// importing it from the file lifecycle would pull the whole pdfium render path
// into the startup chunk. The cache registers itself here when it loads, so the
// boot path only carries this indirection.

type ForgetPageImages = (fileId: FileId) => void;

let forget: ForgetPageImages | null = null;

export function registerPageImageCache(cache: ForgetPageImages): void {
  forget = cache;
}

export function forgetCachedPageImages(fileId: FileId): void {
  forget?.(fileId);
}
