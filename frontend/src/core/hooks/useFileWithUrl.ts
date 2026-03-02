import { useMemo, useEffect } from 'react';
import { isFileObject } from '@app/types/fileContext';

/**
 * Hook to convert a File object to { file: File; url: string } format
 * Creates blob URL on-demand and revokes it when file changes or component unmounts.
 */
export function useFileWithUrl(file: File | Blob | null): { file: File | Blob; url: string } | null {
  const result = useMemo(() => {
    if (!file) return null;

    // Validate that file is a proper File, StirlingFile, or Blob object
    if (!isFileObject(file) && !(file instanceof Blob)) {
      console.warn('useFileWithUrl: Expected File or Blob, got:', file);
      return null;
    }

    try {
      const url = URL.createObjectURL(file);
      return { file, url };
    } catch (error) {
      console.error('useFileWithUrl: Failed to create object URL:', error, file);
      return null;
    }
  }, [file]);

  useEffect(() => {
    const url = result?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [result]);

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
