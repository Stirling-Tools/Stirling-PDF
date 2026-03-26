import { useState, useEffect } from 'react';
import { useAppConfig } from '@app/contexts/AppConfigContext';
import { authService } from '@app/services/authService';
import { connectionModeService } from '@app/services/connectionModeService';

/**
 * Desktop override: shared (group) signing requires self-hosted mode AND
 * an authenticated session. Returns false in SaaS mode or when logged out.
 */
export function useGroupSigningEnabled(): boolean {
  const { config } = useAppConfig();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isSelfHosted, setIsSelfHosted] = useState(false);

  useEffect(() => {
    void connectionModeService.getCurrentMode().then(mode => setIsSelfHosted(mode === 'selfhosted'));
    return connectionModeService.subscribeToModeChanges(cfg => setIsSelfHosted(cfg.mode === 'selfhosted'));
  }, []);

  useEffect(() => {
    void authService.isAuthenticated().then(setIsAuthenticated);
    return authService.subscribeToAuth(status => setIsAuthenticated(status === 'authenticated'));
  }, []);

  return isSelfHosted && isAuthenticated && config?.storageGroupSigningEnabled === true;
}
