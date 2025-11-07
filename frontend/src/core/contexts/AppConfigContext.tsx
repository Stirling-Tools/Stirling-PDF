import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import apiClient from '@app/services/apiClient';

export interface AppConfig {
  baseUrl?: string;
  contextPath?: string;
  serverPort?: number;
  appNameNavbar?: string;
  languages?: string[];
  enableLogin?: boolean;
  enableEmailInvites?: boolean;
  isAdmin?: boolean;
  enableAlphaFunctionality?: boolean;
  enableAnalytics?: boolean | null;
  enablePosthog?: boolean | null;
  enableScarf?: boolean | null;
  premiumEnabled?: boolean;
  premiumKey?: string;
  termsAndConditions?: string;
  privacyPolicy?: string;
  cookiePolicy?: string;
  impressum?: string;
  accessibilityStatement?: string;
  runningProOrHigher?: boolean;
  runningEE?: boolean;
  license?: string;
  SSOAutoLogin?: boolean;
  serverCertificateEnabled?: boolean;
  error?: string;
}

interface AppConfigContextValue {
  config: AppConfig | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const AppConfigContext = createContext<AppConfigContextValue | undefined>({
  config: null,
  loading: true,
  error: null,
  refetch: async () => {},
});

/**
 * Provider component that fetches and provides app configuration
 * Should be placed at the top level of the app, before any components that need config
 */
export const AppConfigProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchCount, setFetchCount] = useState(0);

  const fetchConfig = async (force = false) => {
    // Prevent duplicate fetches unless forced
    if (!force && fetchCount > 0) {
      console.debug('[AppConfig] Already fetched, skipping');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // apiClient automatically adds JWT header if available via interceptors
      const response = await apiClient.get<AppConfig>('/api/v1/config/app-config');
      const data = response.data;

      console.debug('[AppConfig] Config fetched successfully:', data);
      setConfig(data);
      setFetchCount(prev => prev + 1);
    } catch (err: unknown) {
      // On 401 (not authenticated), use default config with login enabled
      // This allows the app to work even without authentication
      const responseStatus = typeof err === 'object' && err !== null && 'response' in err
        ? (err as { response?: { status?: number } }).response?.status
        : undefined;
      if (responseStatus === 401) {
        console.debug('[AppConfig] 401 error - using default config (login enabled)');
        setConfig({ enableLogin: true });
        setLoading(false);
        return;
      }

      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      console.error('[AppConfig] Failed to fetch app config:', err);
      // On error, assume login is enabled (safe default)
      setConfig({ enableLogin: true });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Always try to fetch config to check if login is disabled
    // The endpoint should be public and return proper JSON
    fetchConfig();
  }, []);

  // Listen for JWT availability (triggered on login/signup)
  useEffect(() => {
    const handleJwtAvailable = () => {
      console.debug('[AppConfig] JWT available event - refetching config');
      // Force refetch with JWT
      fetchConfig(true);
    };

    window.addEventListener('jwt-available', handleJwtAvailable);
    return () => window.removeEventListener('jwt-available', handleJwtAvailable);
  }, []);

  const value: AppConfigContextValue = {
    config,
    loading,
    error,
    refetch: () => fetchConfig(true),
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
