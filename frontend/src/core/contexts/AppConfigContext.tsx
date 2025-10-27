import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRequestHeaders } from '@app/hooks/useRequestHeaders';

// Helper to get JWT from localStorage for Authorization header
function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('stirling_jwt');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

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
export const AppConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const headers = useRequestHeaders();
  const [hasFetched, setHasFetched] = useState(false);

  const fetchConfig = async () => {
    // Prevent duplicate fetches
    if (hasFetched) {
      console.debug('[AppConfig] Already fetched, skipping');
      return;
    }

  // Don't fetch config if we're on the login page and don't have JWT
  const isLoginPage = window.location.pathname.includes('/login');
  const hasJwt = !!localStorage.getItem('stirling_jwt');

  if (isLoginPage && !hasJwt) {
    console.debug('[AppConfigContext] On login page without JWT - using default config');
    setConfig({ enableLogin: true });
    setLoading(false);
    return;
  }

    try {
      setLoading(true);
      setError(null);
      setHasFetched(true);

      const response = await fetch('/api/v1/config/app-config', {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        // On 401 (not authenticated), use default config with login enabled
        if (response.status === 401) {
          console.debug('[AppConfig] 401 error - using default config (login enabled)');
          setConfig({ enableLogin: true });
          setLoading(false);
          return;
        }
        throw new Error(`Failed to fetch config: ${response.status} ${response.statusText}`);
      }

      const data: AppConfig = await response.json();
      console.debug('[AppConfig] Config fetched successfully:', data);
      setConfig(data);
    } catch (err) {
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
    // Only fetch config if we have JWT or if checking for anonymous mode
    const hasJwt = !!localStorage.getItem('stirling_jwt');

    // Always try to fetch config to check if login is disabled
    // The endpoint should be public and return proper JSON
    fetchConfig();
  }, []);

  // Listen for JWT availability (triggered on login/signup)
  useEffect(() => {
    const handleJwtAvailable = () => {
      console.debug('[AppConfig] JWT available event - refetching config');
      // Reset the flag to allow refetch with JWT
      setHasFetched(false);
      fetchConfig();
    };

    window.addEventListener('jwt-available', handleJwtAvailable);
    return () => window.removeEventListener('jwt-available', handleJwtAvailable);
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
