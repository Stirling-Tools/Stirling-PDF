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
    console.log('[BackendInitializer] Hook fired - enabled:', enabled, 'status:', status, 'backendUrl:', backendUrl, 'isRunning:', tauriBackendService.isBackendRunning());

    // Skip if disabled
    if (!enabled) {
      console.log('[BackendInitializer] Disabled, skipping');
      return;
    }

    // Skip if backend already running
    if (tauriBackendService.isBackendRunning()) {
      console.log('[BackendInitializer] Backend already running, checking health');
      void checkHealth();
      return;
    }

    const initializeBackend = async () => {
      try {
        console.log('[BackendInitializer] Starting backend with URL:', backendUrl || '(empty - local backend)');
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
    console.log('[BackendInitializer] Checking if should start - status:', status);
    if (status !== 'healthy' && status !== 'starting') {
      console.log('[BackendInitializer] Calling initializeBackend...');
      void initializeBackend();
    } else {
      console.log('[BackendInitializer] Backend status is', status, '- not starting');
    }
  }, [enabled, status, backendUrl, checkHealth]);
}
