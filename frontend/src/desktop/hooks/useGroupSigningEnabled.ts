import { useState, useEffect, useRef } from 'react';
import { useAppConfig } from '@app/contexts/AppConfigContext';
import { authService } from '@app/services/authService';
import { connectionModeService } from '@app/services/connectionModeService';

/**
 * Desktop override: shared (group) signing requires self-hosted mode AND
 * an authenticated session. Returns false in SaaS mode or when logged out.
 */
export function useGroupSigningEnabled(): boolean {
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

  // When the mode transitions to selfhosted, the jwt-available config fetch ran
  // against the local bundled backend (wrong server). Re-fetch now that the
  // correct self-hosted URL is active so storageGroupSigningEnabled is accurate.
  useEffect(() => {
    if (isSelfHosted && !wasSelfHosted.current) {
      void refetch();
    }
    wasSelfHosted.current = isSelfHosted;
  }, [isSelfHosted, refetch]);

  return isSelfHosted && isAuthenticated && config?.storageGroupSigningEnabled === true;
}
