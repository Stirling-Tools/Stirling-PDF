import React, { createContext, useContext, useState, useEffect } from 'react';

export interface AppConfig {
  baseUrl?: string;
  contextPath?: string;
  serverPort?: number;
  appName?: string;
  appNameNavbar?: string;
  homeDescription?: string;
  languages?: string[];
  enableLogin?: boolean;
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

// Create context
const AppConfigContext = createContext<AppConfigContextValue | undefined>(undefined);

/**
 * Provider component that fetches and provides app configuration
 * Should be placed at the top level of the app, before any components that need config
 */
export const AppConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/v1/config/app-config');

      if (!response.ok) {
        throw new Error(`Failed to fetch config: ${response.status} ${response.statusText}`);
      }

      const data: AppConfig = await response.json();
      setConfig(data);
      console.warn('[AppConfig] Fetched app config:', data);
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

