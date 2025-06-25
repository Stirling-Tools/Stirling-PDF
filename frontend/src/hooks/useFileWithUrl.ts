import { useMemo } from 'react';

/**
 * Hook to convert a File object to { file: File; url: string } format
 * Creates blob URL on-demand and handles cleanup
 */
export function useFileWithUrl(file: File | null): { file: File; url: string } | null {
  return useMemo(() => {
    if (!file) return null;
    
    // Validate that file is a proper File or Blob object
    if (!(file instanceof File) && !(file instanceof Blob)) {
      console.warn('useFileWithUrl: Expected File or Blob, got:', file);
      return null;
    }
    
    try {
      const url = URL.createObjectURL(file);
      
      // Return object with cleanup function
      const result = { file, url };
      
      // Store cleanup function for later use
      (result as any)._cleanup = () => URL.revokeObjectURL(url);
      
      return result;
    } catch (error) {
      console.error('useFileWithUrl: Failed to create object URL:', error, file);
      return null;
    }
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