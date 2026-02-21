import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import apiClient from '@app/services/apiClient';
import { getSimulatedAppConfig } from '@app/testing/serverExperienceSimulations';

/**
 * Sleep utility for delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export interface AppConfigRetryOptions {
  maxRetries?: number;
  initialDelay?: number;
}

export interface AppConfig {
  baseUrl?: string;
  contextPath?: string;
  serverPort?: number;
  frontendUrl?: string;
  appNameNavbar?: string;
  languages?: string[];
  defaultLocale?: string;
  logoStyle?: 'modern' | 'classic';
  enableLogin?: boolean;
  showSettingsWhenNoLogin?: boolean;
  enableEmailInvites?: boolean;
  enableOAuth?: boolean;
  enableSaml?: boolean;
  isAdmin?: boolean;
  enableAlphaFunctionality?: boolean;
  enableAnalytics?: boolean | null;
  enablePosthog?: boolean | null;
  enableScarf?: boolean | null;
  enableDesktopInstallSlide?: boolean;
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
  enableMobileScanner?: boolean;
  mobileScannerConvertToPdf?: boolean;
  mobileScannerImageResolution?: string;
  mobileScannerPageFormat?: string;
  mobileScannerStretchToFit?: boolean;
  appVersion?: string;
  machineType?: string;
  activeSecurity?: boolean;
  dependenciesReady?: boolean;
  error?: string;
  isNewServer?: boolean;
  isNewUser?: boolean;
  defaultHideUnavailableTools?: boolean;
  defaultHideUnavailableConversions?: boolean;
  pluginsPath?: string;
  basePath?: string;
}

export type AppConfigBootstrapMode = 'blocking' | 'non-blocking';

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
export interface AppConfigProviderProps {
  children: ReactNode;
  retryOptions?: AppConfigRetryOptions;
  initialConfig?: AppConfig | null;
  bootstrapMode?: AppConfigBootstrapMode;
  autoFetch?: boolean;
}

export const AppConfigProvider: React.FC<AppConfigProviderProps> = ({
  children,
  retryOptions,
  initialConfig = null,
  bootstrapMode = 'blocking',
  autoFetch = true,
}) => {
  const isBlockingMode = bootstrapMode === 'blocking';
  const [config, setConfig] = useState<AppConfig | null>(initialConfig);
  const [error, setError] = useState<string | null>(null);
  // Track how many times we've attempted to fetch. useRef avoids re-renders that can trigger loops.
  const fetchCountRef = React.useRef(0);
  const [hasResolvedConfig, setHasResolvedConfig] = useState(Boolean(initialConfig) && !isBlockingMode);
  const [loading, setLoading] = useState(!hasResolvedConfig);

  const maxRetries = retryOptions?.maxRetries ?? 0;
  const initialDelay = retryOptions?.initialDelay ?? 1000;

  const fetchConfig = useCallback(async (force = false) => {
    // Prevent duplicate fetches unless forced
    if (!force && fetchCountRef.current > 0) {
      console.debug('[AppConfig] Already fetched, skipping');
      return;
    }

    // Mark that we've attempted a fetch to prevent repeated auto-fetch loops
    fetchCountRef.current += 1;

    const shouldBlockUI = !hasResolvedConfig || isBlockingMode;
    if (shouldBlockUI) {
      setLoading(true);
    }
    setError(null);

    const startTime = performance.now();
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const testConfig = getSimulatedAppConfig();
        if (testConfig) {
          setConfig(testConfig);
          setHasResolvedConfig(true);
          setLoading(false);
          return;
        }

        if (attempt > 0) {
          const delay = initialDelay * Math.pow(2, attempt - 1);
          console.log(`[AppConfig] Retry attempt ${attempt}/${maxRetries} after ${delay}ms delay...`);
          await sleep(delay);
        } else {
          console.log('[AppConfig] Fetching app config...');
        }

        // apiClient automatically adds JWT header if available via interceptors
        // Always suppress error toast - we handle 401 errors locally
        console.debug('[AppConfig] Fetching app config', { attempt, force, path: window.location.pathname });
        const response = await apiClient.get<AppConfig>(
          '/api/v1/config/app-config',
          {
            suppressErrorToast: true,
            skipAuthRedirect: true,
          } as any,
        );
        const data = response.data;

        console.debug('[AppConfig] Config fetched successfully:', data);
        console.debug('[AppConfig] Fetch duration ms:', (performance.now() - startTime).toFixed(2));
        setConfig(data);
        setHasResolvedConfig(true);
        setLoading(false);
        return; // Success - exit function
      } catch (err: any) {
        const status = err?.response?.status;

        // On 401 (not authenticated), use default config with login enabled
        // This allows the app to work even without authentication
        if (status === 401) {
          console.debug('[AppConfig] 401 error - using default config (login enabled)');
          console.debug('[AppConfig] Fetch duration ms:', (performance.now() - startTime).toFixed(2));
          setConfig({ enableLogin: true });
          setHasResolvedConfig(true);
          setLoading(false);
          return;
        }

        // Check if we should retry (network errors or 5xx errors)
        const shouldRetry = (!status || status >= 500) && attempt < maxRetries;

        if (shouldRetry) {
          console.warn(`[AppConfig] Attempt ${attempt + 1} failed (status ${status || 'network error'}):`, err.message, '- will retry...');
          continue;
        }

        // Final attempt failed or non-retryable error (4xx)
        const errorMessage = err?.response?.data?.message || err?.message || 'Unknown error occurred';
        setError(errorMessage);
        console.error(`[AppConfig] Failed to fetch app config after ${attempt + 1} attempts:`, err);
        console.debug('[AppConfig] Fetch duration ms:', (performance.now() - startTime).toFixed(2));
        // Preserve existing config (initial default or previous fetch). If nothing is set, assume login enabled.
        setConfig((current) => current ?? { enableLogin: true });
        setHasResolvedConfig(true);
        break;
      }
    }

    setLoading(false);
  }, [hasResolvedConfig, isBlockingMode, maxRetries, initialDelay]);

  useEffect(() => {
    // Skip config fetch on auth pages (/login, /signup, /auth/callback, /invite/*)
    // Config will be fetched after successful authentication via jwt-available event
    const currentPath = window.location.pathname;
    const isAuthPage = currentPath.includes('/login') ||
                       currentPath.includes('/signup') ||
                       currentPath.includes('/auth/callback') ||
                       currentPath.includes('/invite/');

    // On auth pages, always skip the config fetch
    // The config will be fetched after authentication via jwt-available event
    if (isAuthPage) {
      console.debug('[AppConfig] On auth page - using default config, skipping fetch', { path: currentPath });
      setConfig({ enableLogin: true });
      setHasResolvedConfig(true);
      setLoading(false);
      return;
    }

    // On non-auth pages, fetch config (will validate JWT if present)
    if (autoFetch) {
      fetchConfig();
    }
  }, [autoFetch, fetchConfig]);

  // Listen for JWT availability (triggered on login/signup)
  useEffect(() => {
    const handleJwtAvailable = () => {
      console.debug('[AppConfig] JWT available event - refetching config');
      // Force refetch with JWT
      fetchConfig(true);
    };

    window.addEventListener('jwt-available', handleJwtAvailable);
    return () => window.removeEventListener('jwt-available', handleJwtAvailable);
  }, [fetchConfig]);

  const refetch = useCallback(() => fetchConfig(true), [fetchConfig]);

  const value: AppConfigContextValue = {
    config,
    loading,
    error,
    refetch,
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
