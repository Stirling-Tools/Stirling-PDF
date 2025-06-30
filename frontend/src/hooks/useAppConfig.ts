import { useState, useEffect } from 'react';

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
  enableAnalytics?: boolean;
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
  GoogleDriveEnabled?: boolean;
  SSOAutoLogin?: boolean;
  error?: string;
}

interface UseAppConfigReturn {
  config: AppConfig | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Custom hook to fetch and manage application configuration
 */
export function useAppConfig(): UseAppConfigReturn {
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
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      console.error('Failed to fetch app config:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  return {
    config,
    loading,
    error,
    refetch: fetchConfig,
  };
}

