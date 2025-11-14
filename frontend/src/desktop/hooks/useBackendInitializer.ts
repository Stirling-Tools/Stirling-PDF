import { useEffect } from 'react';
import { useBackendHealth } from '@app/hooks/useBackendHealth';
import { useEndpointConfig } from '@app/hooks/useEndpointConfig';
import { tauriBackendService } from '@app/services/tauriBackendService';

/**
 * Hook to initialize backend and monitor health
 * @param enabled - Whether to initialize the backend (default: true)
 */
export function useBackendInitializer(enabled = true) {
  const { status, checkHealth } = useBackendHealth();
  const { backendUrl } = useEndpointConfig();

  useEffect(() => {
    // Skip if disabled
    if (!enabled) {
      return;
    }

    // Skip if backend already running
    if (tauriBackendService.isBackendRunning()) {
      void checkHealth();
      return;
    }

    const initializeBackend = async () => {
      try {
        console.log('[BackendInitializer] Starting backend...');
        await tauriBackendService.startBackend(backendUrl);
        console.log('[BackendInitializer] Backend started successfully');

        // Begin health checks after a short delay
        setTimeout(() => {
          void checkHealth();
        }, 500);
      } catch (error) {
        console.error('[BackendInitializer] Failed to start backend:', error);
      }
    };

    // Only start backend if it's not already starting/healthy
    if (status !== 'healthy' && status !== 'starting') {
      void initializeBackend();
    }
  }, [enabled, status, backendUrl, checkHealth]);
}
