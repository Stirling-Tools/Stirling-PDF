import type { FileId } from "@app/types/file";

type ForgetPageImages = (fileId: FileId) => void;

let forget: ForgetPageImages | null = null;

/** Registers the cache's eviction hook; a later registration replaces the previous one. */
export function registerPageImageCache(cache: ForgetPageImages): void {
  forget = cache;
}

/** Evicts a file's cached page images; a no-op until a cache registers. */
export function forgetCachedPageImages(fileId: FileId): void {
  forget?.(fileId);
}
