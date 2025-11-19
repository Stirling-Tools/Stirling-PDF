import { useEffect } from 'react';
import { useBackendHealth } from '@app/hooks/useBackendHealth';
import { tauriBackendService } from '@app/services/tauriBackendService';

/**
 * Hook to initialize backend and monitor health
 */
export function useBackendInitializer() {
  const { status, checkHealth } = useBackendHealth();

  useEffect(() => {
    // Skip if backend already running
    if (tauriBackendService.isBackendRunning()) {
      void checkHealth();
      return;
    }

    const initializeBackend = async () => {
      try {
        console.log('[BackendInitializer] Starting backend...');
        await tauriBackendService.startBackend();
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
  }, [status, checkHealth]);
}
