import React, { createContext, useContext, useState, useEffect } from 'react';

// Helper to get JWT from localStorage for Authorization header
function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('stirling_jwt');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

// Retry configuration
const MAX_RETRIES = 5;
const INITIAL_DELAY = 1000; // 1 second

/**
 * Sleep utility for delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Determines if an error is retryable (network errors or server errors)
 */
function isRetryableError(error: unknown, response?: Response): boolean {
  // Network errors (fetch failures)
  if (error instanceof TypeError) {
    return true;
  }

  // Server errors (5xx)
  if (response && response.status >= 500) {
    return true;
  }

  // Don't retry client errors (4xx) or successful responses
  return false;
}

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
    setLoading(true);
    setError(null);

    let lastError: unknown = null;
    let lastResponse: Response | undefined = undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          const delay = INITIAL_DELAY * Math.pow(2, attempt - 1);
          console.log(`[AppConfig] Retry attempt ${attempt}/${MAX_RETRIES} after ${delay}ms delay...`);
          await sleep(delay);
        } else {
          console.log('[AppConfig] Fetching app config...');
        }

        const response = await fetch('/api/v1/config/app-config', {
          headers: getAuthHeaders(),
        });

        lastResponse = response;

        if (!response.ok) {
          const error = new Error(`Failed to fetch config: ${response.status} ${response.statusText}`);

          // Check if we should retry
          if (isRetryableError(error, response) && attempt < MAX_RETRIES) {
            lastError = error;
            console.warn(`[AppConfig] Attempt ${attempt + 1} failed with ${response.status}, will retry...`);
            continue;
          }

          // Don't retry client errors (4xx)
          throw error;
        }

        const data: AppConfig = await response.json();
        setConfig(data);
        console.log('[AppConfig] Successfully fetched app config');
        setLoading(false);
        return; // Success - exit function
      } catch (err) {
        lastError = err;

        // Check if we should retry
        if (isRetryableError(err, lastResponse) && attempt < MAX_RETRIES) {
          console.warn(`[AppConfig] Attempt ${attempt + 1} failed:`, err, '- will retry...');
          continue;
        }

        // Final attempt failed or non-retryable error
        const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
        setError(errorMessage);
        console.error(`[AppConfig] Failed to fetch app config after ${attempt + 1} attempts:`, err);
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

