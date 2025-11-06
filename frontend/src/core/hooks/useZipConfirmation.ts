import { useState, useCallback } from 'react';

interface ZipConfirmationState {
  opened: boolean;
  fileCount: number;
  fileName: string;
  resolve: ((value: boolean) => void) | null;
}

/**
 * Hook to manage ZIP warning confirmation dialog
 * Returns state and handlers for the confirmation dialog
 */
export const useZipConfirmation = () => {
  const [confirmationState, setConfirmationState] = useState<ZipConfirmationState>({
    opened: false,
    fileCount: 0,
    fileName: '',
    resolve: null,
  });

  /**
   * Request confirmation from user for extracting a large ZIP file
   * Returns a Promise that resolves to true if user confirms, false if cancelled
   */
  const requestConfirmation = useCallback((fileCount: number, fileName: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirmationState({
        opened: true,
        fileCount,
        fileName,
        resolve,
      });
    });
  }, []);

  /**
   * Handle user confirmation - extract the ZIP
   */
  const handleConfirm = useCallback(() => {
    if (confirmationState.resolve) {
      confirmationState.resolve(true);
    }
    setConfirmationState({
      opened: false,
      fileCount: 0,
      fileName: '',
      resolve: null,
    });
  }, [confirmationState]);

  /**
   * Handle user cancellation - keep ZIP as-is
   */
  const handleCancel = useCallback(() => {
    if (confirmationState.resolve) {
      confirmationState.resolve(false);
    }
    setConfirmationState({
      opened: false,
      fileCount: 0,
      fileName: '',
      resolve: null,
    });
  }, [confirmationState]);

  return {
    confirmationState,
    requestConfirmation,
    handleConfirm,
    handleCancel,
  };
};
