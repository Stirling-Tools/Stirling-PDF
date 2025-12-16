import { useState, useEffect } from 'react';
import apiClient from '@app/services/apiClient';

interface AppConfig {
  frontendUrl?: string;
  [key: string]: unknown;
}

/**
 * Hook to get the configured frontend URL from backend app-config.
 * Falls back to window.location.origin if not configured.
 */
export const useFrontendUrl = (): string => {
  const [frontendUrl, setFrontendUrl] = useState<string>(window.location.origin);

  useEffect(() => {
    const fetchFrontendUrl = async () => {
      try {
        const response = await apiClient.get<AppConfig>('/api/v1/app-config');
        const configuredUrl = response.data.frontendUrl;

        // Use configured URL if not empty, otherwise keep window.location.origin
        if (configuredUrl && configuredUrl.trim() !== '') {
          setFrontendUrl(configuredUrl);
        }
      } catch (error) {
        console.warn('Failed to fetch app config, using window.location.origin:', error);
        // Keep the default window.location.origin on error
      }
    };

    fetchFrontendUrl();
  }, []);

  return frontendUrl;
};
