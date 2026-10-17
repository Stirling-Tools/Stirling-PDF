import type { FileId } from "@app/types/file";

// Dropping a removed file's cached page images needs the page-image cache, but importing it from the file.

type ForgetPageImages = (fileId: FileId) => void;

let forget: ForgetPageImages | null = null;

export function registerPageImageCache(cache: ForgetPageImages): void {
  forget = cache;
}

export function forgetCachedPageImages(fileId: FileId): void {
  forget?.(fileId);
}
