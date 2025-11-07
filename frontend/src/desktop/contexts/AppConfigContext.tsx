import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import apiClient from '@app/services/apiClient';

// Retry configuration
const MAX_RETRIES = 5;
const INITIAL_DELAY = 1000; // 1 second

/**
 * Sleep utility for delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

interface ErrorPayload {
  message?: string;
  error?: string;
}

function extractErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError<ErrorPayload>(error)) {
    return error.response?.data?.message
      || error.response?.data?.error
      || error.message
      || fallback;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
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
    setLoading(true);
    setError(null);


    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          const delay = INITIAL_DELAY * Math.pow(2, attempt - 1);
          console.log(`[AppConfig] Retry attempt ${attempt}/${MAX_RETRIES} after ${delay}ms delay...`);
          await sleep(delay);
        } else {
          console.log('[AppConfig] Fetching app config...');
        }

        const response = await apiClient.get<AppConfig>('/api/v1/config/app-config');

        setConfig(response.data);
        console.log('[AppConfig] Successfully fetched app config');
        setLoading(false);
        return; // Success - exit function
      } catch (error: unknown) {
        const status = axios.isAxiosError(error) ? error.response?.status : undefined;

        // Check if we should retry (network errors or 5xx errors)
        const shouldRetry = (!status || status >= 500) && attempt < MAX_RETRIES;

        if (shouldRetry) {
          const message = extractErrorMessage(error, 'Unknown error');
          console.warn(`[AppConfig] Attempt ${attempt + 1} failed (status ${status || 'network error'}):`, message, '- will retry...');
          continue;
        }

        // Final attempt failed or non-retryable error (4xx)
        const errorMessage = extractErrorMessage(error, 'Unknown error occurred');
        setError(errorMessage);
        console.error(`[AppConfig] Failed to fetch app config after ${attempt + 1} attempts:`, error);
        break;
      }
    }

    setLoading(false);
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
