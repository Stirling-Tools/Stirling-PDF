import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import licenseService, { LicenseInfo } from '@app/services/licenseService';

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
  const [licenseInfo, setLicenseInfo] = useState<LicenseInfo | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refetchLicense = useCallback(async () => {
    try {
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

  // Fetch license info on mount
  useEffect(() => {
    refetchLicense();
  }, [refetchLicense]);

  const contextValue: LicenseContextValue = {
    licenseInfo,
    loading,
    error,
    refetchLicense,
  };

  return (
    <LicenseContext.Provider value={contextValue}>
      {children}
    </LicenseContext.Provider>
  );
};

export const useLicense = (): LicenseContextValue => {
  const context = useContext(LicenseContext);
  if (!context) {
    throw new Error('useLicense must be used within LicenseProvider');
  }
  return context;
};
