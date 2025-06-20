import { useMemo } from 'react';

/**
 * Hook to convert a File object to { file: File; url: string } format
 * Creates blob URL on-demand and handles cleanup
 */
export function useFileWithUrl(file: File | null): { file: File; url: string } | null {
  return useMemo(() => {
    if (!file) return null;
    
    const url = URL.createObjectURL(file);
    
    // Return object with cleanup function
    const result = { file, url };
    
    // Store cleanup function for later use
    (result as any)._cleanup = () => URL.revokeObjectURL(url);
    
    return result;
  }, [file]);
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