import { useState, useCallback, useRef } from 'react';

interface ZipConfirmationState {
  opened: boolean;
  fileCount: number;
  fileName: string;
}

/**
 * Hook to manage ZIP warning confirmation dialog
 * Returns state and handlers for the confirmation dialog
 * Uses useRef to avoid recreating callbacks on every state change
 */
export const useZipConfirmation = () => {
  const [confirmationState, setConfirmationState] = useState<ZipConfirmationState>({
    opened: false,
    fileCount: 0,
    fileName: '',
  });

  // Store resolve function in ref to avoid callback recreation
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  /**
   * Request confirmation from user for extracting a large ZIP file
   * Returns a Promise that resolves to true if user confirms, false if cancelled
   */
  const requestConfirmation = useCallback((fileCount: number, fileName: string): Promise<boolean> => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setConfirmationState({
        opened: true,
        fileCount,
        fileName,
      });
    });
  }, []);

  /**
   * Handle user confirmation - extract the ZIP
   */
  const handleConfirm = useCallback(() => {
    if (resolveRef.current) {
      resolveRef.current(true);
      resolveRef.current = null;
    }
    setConfirmationState({
      opened: false,
      fileCount: 0,
      fileName: '',
    });
  }, []); // No dependencies - uses ref

  /**
   * Handle user cancellation - keep ZIP as-is
   */
  const handleCancel = useCallback(() => {
    if (resolveRef.current) {
      resolveRef.current(false);
      resolveRef.current = null;
    }
    setConfirmationState({
      opened: false,
      fileCount: 0,
      fileName: '',
    });
  }, []); // No dependencies - uses ref

  return {
    confirmationState,
    requestConfirmation,
    handleConfirm,
    handleCancel,
  };
};
