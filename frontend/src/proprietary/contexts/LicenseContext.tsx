import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef, ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import licenseService, { LicenseInfo } from '@app/services/licenseService';
import { useAppConfig } from '@app/contexts/AppConfigContext';
import { getSimulatedLicenseInfo } from '@app/testing/serverExperienceSimulations';

interface LicenseContextValue {
  licenseInfo: LicenseInfo | null;
  loading: boolean;
  error: string | null;
  refetchLicense: () => Promise<void>;
}

const LicenseContext = createContext<LicenseContextValue | undefined>(undefined);

interface LicenseProviderProps {
  children: ReactNode;
}

export const LicenseProvider: React.FC<LicenseProviderProps> = ({ children }) => {
  const { config } = useAppConfig();
  const location = useLocation();
  const configRef = useRef(config);
  const [licenseInfo, setLicenseInfo] = useState<LicenseInfo | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Keep ref updated with latest config
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  const refetchLicense = useCallback(async () => {
    // Wait for config to load if it's not available yet
    let currentConfig = configRef.current;
    if (!currentConfig) {
      console.log('[LicenseContext] Config not loaded yet, waiting...');
      // OPTIMIZATION: Reduced from 5s to 1s - config should load quickly
      const maxWait = 1000;
      const startTime = Date.now();
      while (!configRef.current && Date.now() - startTime < maxWait) {
        await new Promise(resolve => setTimeout(resolve, 100));
        currentConfig = configRef.current;
      }

      if (!currentConfig) {
        console.error('[LicenseContext] Config failed to load after waiting');
        setLoading(false);
        return;
      }
    }

    // Only fetch license info if user is an admin
    if (!currentConfig.isAdmin) {
      console.log('[LicenseContext] User is not an admin, skipping license fetch');
      setLoading(false);
      return;
    }

    console.log('[LicenseContext] Fetching license info');

    try {
      const testInfo = getSimulatedLicenseInfo();
      if (testInfo) {
        setLicenseInfo(testInfo);
        setLoading(false);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);
      const info = await licenseService.getLicenseInfo();
      setLicenseInfo(info);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch license info';
      console.error('Error fetching license info:', errorMessage);
      setError(errorMessage);
      setLicenseInfo(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch license info when config changes (only if user is admin)
  useEffect(() => {
    // CRITICAL FIX: Skip license fetch on auth routes to prevent race conditions
    // during SAML/OAuth callback processing. License isn't needed until user
    // is authenticated and navigates to main app.
    const isAuthRoute =
      location.pathname === '/login' ||
      location.pathname === '/signup' ||
      location.pathname === '/auth/callback' ||
      location.pathname.startsWith('/invite/');

    if (isAuthRoute) {
      console.log('[LicenseContext] On auth route, skipping license fetch');
      setLoading(false);
      return;
    }

    if (config) {
      refetchLicense();
    }
  }, [config, refetchLicense, location.pathname]);

  const contextValue: LicenseContextValue = useMemo(
    () => ({
      licenseInfo,
      loading,
      error,
      refetchLicense,
    }),
    [licenseInfo, loading, error, refetchLicense]
  );

  return (
    <LicenseContext.Provider value={contextValue}>
      {children}
    </LicenseContext.Provider>
  );
};

export const useOptionalLicense = (): LicenseContextValue | undefined => {
  return useContext(LicenseContext);
};

export const useLicense = (): LicenseContextValue => {
  const context = useContext(LicenseContext);
  if (!context) {
    throw new Error('useLicense must be used within LicenseProvider');
  }
  return context;
};
