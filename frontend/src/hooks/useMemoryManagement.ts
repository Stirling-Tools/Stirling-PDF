import { useCallback } from 'react';
import { useFileContext } from '../contexts/FileContext';

/**
 * Hook for components that need to register resources with centralized memory management
 */
export function useMemoryManagement() {
  const { trackBlobUrl, trackPdfDocument, scheduleCleanup } = useFileContext();

  const registerBlobUrl = useCallback((url: string) => {
    trackBlobUrl(url);
    return url;
  }, [trackBlobUrl]);

  const registerPdfDocument = useCallback((fileId: string, pdfDoc: any) => {
    trackPdfDocument(fileId, pdfDoc);
    return pdfDoc;
  }, [trackPdfDocument]);

  const cancelCleanup = useCallback((fileId: string) => {
    // Cancel scheduled cleanup (user is actively using the file)
    scheduleCleanup(fileId, -1); // -1 cancels the timer
  }, [scheduleCleanup]);

  return {
    registerBlobUrl,
    registerPdfDocument,
    cancelCleanup
  };
}