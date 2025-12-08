/**
 * React hook for Google Drive file picker
 */

import { useState, useCallback, useEffect } from 'react';
import {
  getGoogleDrivePickerService,
  isGoogleDriveConfigured,
  getGoogleDriveConfig,
} from '@app/services/googleDrivePickerService';

interface UseGoogleDrivePickerOptions {
  multiple?: boolean;
  mimeTypes?: string;
}

interface UseGoogleDrivePickerReturn {
  isEnabled: boolean;
  isLoading: boolean;
  error: string | null;
  openPicker: (options?: UseGoogleDrivePickerOptions) => Promise<File[]>;
}

/**
 * Hook to use Google Drive file picker
 */
export function useGoogleDrivePicker(): UseGoogleDrivePickerReturn {
  const [isEnabled, setIsEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Check if Google Drive is configured on mount
  useEffect(() => {
    const configured = isGoogleDriveConfigured();
    setIsEnabled(configured);
  }, []);

  /**
   * Initialize the Google Drive service (lazy initialization)
   */
  const initializeService = useCallback(async () => {
    if (isInitialized) return;

    const config = getGoogleDriveConfig();
    if (!config) {
      throw new Error('Google Drive is not configured');
    }

    const service = getGoogleDrivePickerService();
    await service.initialize(config);
    setIsInitialized(true);
  }, [isInitialized]);

  /**
   * Open the Google Drive picker
   */
  const openPicker = useCallback(
    async (options: UseGoogleDrivePickerOptions = {}): Promise<File[]> => {
      if (!isEnabled) {
        setError('Google Drive is not configured');
        return [];
      }

      try {
        setIsLoading(true);
        setError(null);

        // Initialize service if needed
        await initializeService();

        // Open picker
        const service = getGoogleDrivePickerService();
        const files = await service.openPicker({
          multiple: options.multiple ?? true,
          mimeTypes: options.mimeTypes,
        });

        return files;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to open Google Drive picker';
        setError(errorMessage);
        console.error('Google Drive picker error:', err);
        return [];
      } finally {
        setIsLoading(false);
      }
    },
    [isEnabled, initializeService]
  );

  return {
    isEnabled,
    isLoading,
    error,
    openPicker,
  };
}
