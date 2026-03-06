import React, { createContext, useContext, useState, useEffect } from 'react';
import apiClient from '@app/services/apiClient';
import { setBaseUrl } from '@app/constants/app';
import type { AppConfig, AppConfigProviderProps } from '@core/contexts/AppConfigContext';

// Re-export types from core for compatibility
export type {
  AppConfig,
  AppConfigRetryOptions,
  AppConfigProviderProps,
  AppConfigBootstrapMode,
} from '@core/contexts/AppConfigContext';

interface AppConfigContextValue {
  config: AppConfig | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

// Create context
const AppConfigContext = createContext<AppConfigContextValue | undefined>(undefined);

/**
 * Provider component that fetches and provides app configuration
 * Should be placed at the top level of the app, before any components that need config
 */
export const AppConfigProvider: React.FC<AppConfigProviderProps> = ({
  children,
  retryOptions: _retryOptions,
  initialConfig: _initialConfig = null,
  bootstrapMode: _bootstrapMode = 'blocking',
  autoFetch: _autoFetch = true,
}) => {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await apiClient.get('/api/v1/config/app-config');

      const data: AppConfig = response.data;
      setConfig(data);

      // Set the base URL globally if provided
      if (data.baseUrl) {
        setBaseUrl(data.baseUrl);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      console.error('[AppConfig] Failed to fetch app config:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const value: AppConfigContextValue = {
    config,
    loading,
    error,
    refetch: fetchConfig,
  };

  return (
    <AppConfigContext.Provider value={value}>
      {children}
    </AppConfigContext.Provider>
  );
};

/**
 * Hook to access application configuration
 * Must be used within AppConfigProvider
 */
export function useAppConfig(): AppConfigContextValue {
  const context = useContext(AppConfigContext);

  if (context === undefined) {
    throw new Error('useAppConfig must be used within AppConfigProvider');
  }

  return context;
}

