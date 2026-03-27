import { useState, useEffect, useRef } from 'react';
import { useAppConfig } from '@app/contexts/AppConfigContext';
import { authService } from '@app/services/authService';
import { connectionModeService } from '@app/services/connectionModeService';
import type { SharingEnabledResult } from '@core/hooks/useSharingEnabled';

/**
 * Desktop override: file-sharing features require self-hosted mode AND an
 * authenticated session. Returns false for both in SaaS/local mode or when
 * logged out.
 */
export function useSharingEnabled(): SharingEnabledResult {
  const { config, refetch } = useAppConfig();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isSelfHosted, setIsSelfHosted] = useState(false);
  const wasSelfHosted = useRef(false);

  useEffect(() => {
    void connectionModeService.getCurrentMode().then(mode => setIsSelfHosted(mode === 'selfhosted'));
    return connectionModeService.subscribeToModeChanges(cfg => setIsSelfHosted(cfg.mode === 'selfhosted'));
  }, []);

  useEffect(() => {
    void authService.isAuthenticated().then(setIsAuthenticated);
    return authService.subscribeToAuth(status => setIsAuthenticated(status === 'authenticated'));
  }, []);

  // When the mode transitions to selfhosted the jwt-available config fetch ran
  // against the local bundled backend. Re-fetch once the correct self-hosted
  // URL is active so storage feature flags are accurate.
  useEffect(() => {
    if (isSelfHosted && !wasSelfHosted.current) {
      void refetch();
    }
    wasSelfHosted.current = isSelfHosted;
  }, [isSelfHosted, refetch]);

  const allowed = isSelfHosted && isAuthenticated;
  return {
    sharingEnabled: allowed && config?.storageSharingEnabled === true,
    shareLinksEnabled: allowed && config?.storageShareLinksEnabled === true,
  };
}
