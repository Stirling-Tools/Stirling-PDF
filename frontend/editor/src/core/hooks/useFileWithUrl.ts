import { useMemo, useEffect } from "react";
import { isFileObject } from "@app/types/fileContext";

/**
 * Hook to convert a File object to { file: File; url: string } format
 * Creates blob URL on-demand and revokes it when file changes or component unmounts.
 *
 * @param stableKey - Optional stable identity key (e.g. fileId). When provided, the blob
 *   URL is only recreated when this key changes, not when the `file` object reference
 *   changes. This prevents spurious URL churn caused by getFiles() creating new
 *   StirlingFile references on every FileContext render.
 */
const globalUseFileWithUrlCache = new Map<string, string>();

/**
 * Hook to convert a File object to { file: File; url: string } format
 * Creates blob URL on-demand and caches it globally to prevent URL churn and
 * premature revocation during React unmount/remount/Suspense cycles.
 *
 * @param stableKey - Optional stable identity key (e.g. fileId). When provided, the blob
 *   URL is only recreated when this key changes, not when the `file` object reference
 *   changes.
 */
export function useFileWithUrl(
  file: File | Blob | null,
  stableKey?: string | null,
): { file: File | Blob; url: string } | null {
  const result = useMemo(() => {
    if (!file) return null;

    // Validate that file is a proper File, StirlingFile, or Blob object
    if (!isFileObject(file) && !(file instanceof Blob)) {
      console.warn("useFileWithUrl: Expected File or Blob, got:", file);
      return null;
    }

    const key =
      stableKey ||
      (file instanceof File
        ? `${file.name}-${file.size}-${file.lastModified}`
        : `blob-${file.size}`);

    let url = globalUseFileWithUrlCache.get(key);
    if (!url) {
      try {
        url = URL.createObjectURL(file);
        globalUseFileWithUrlCache.set(key, url);
      } catch (error) {
        console.error(
          "useFileWithUrl: Failed to create object URL:",
          error,
          file,
        );
        return null;
      }
    }

    return { file, url };
  }, [stableKey != null ? stableKey : file]);

  return result;
}

/**
 * Hook variant that returns cleanup function separately
 */
export function useFileWithUrlAndCleanup(file: File | null): {
  fileObj: { file: File; url: string } | null;
  cleanup: () => void;
} {
  return useMemo(() => {
    if (!file) return { fileObj: null, cleanup: () => {} };

    const url = URL.createObjectURL(file);
    const fileObj = { file, url };
    const cleanup = () => URL.revokeObjectURL(url);

    return { fileObj, cleanup };
  }, [file]);
}
