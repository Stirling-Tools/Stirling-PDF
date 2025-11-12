import { useEffect, useRef } from 'react';
import { useBackendHealth } from '@app/hooks/useBackendHealth';
import { useAppConfig } from '@app/contexts/AppConfigContext';

/**
 * Desktop-only bridge that refetches the app config once the bundled backend
 * becomes healthy (and whenever it restarts). Keeps the UI responsive by using
 * default config until the real config is available.
 */
export function DesktopConfigSync() {
  const { status } = useBackendHealth();
  const { refetch } = useAppConfig();
  const previousStatus = useRef(status);

  useEffect(() => {
    if (status === 'healthy' && previousStatus.current !== 'healthy') {
      refetch();
    }
    previousStatus.current = status;
  }, [status, refetch]);

  return null;
}
