import { useState, useEffect } from 'react';
import { operationRouter } from '@app/services/operationRouter';
import { tauriBackendService } from '@app/services/tauriBackendService';

/**
 * Desktop hook to detect if an operation will use cloud/SaaS backend
 * @param endpoint - The API endpoint to check (e.g., '/api/v1/misc/compress-pdf')
 * @returns true if the operation will use cloud credits, false otherwise
 */
export function useWillUseCloud(endpoint?: string): boolean {
  const [willUseCloud, setWillUseCloud] = useState(false);

  useEffect(() => {
    const checkCloudRouting = async () => {
      if (!endpoint) {
        setWillUseCloud(false);
        return;
      }

      // Don't show cloud badges until backend is healthy
      // This prevents showing incorrect cloud status during startup
      if (!tauriBackendService.isBackendHealthy()) {
        setWillUseCloud(false);
        return;
      }

      // Check if this endpoint will route to SaaS
      try {
        const willRoute = await operationRouter.willRouteToSaaS(endpoint);
        setWillUseCloud(willRoute);
      } catch (error) {
        console.error('[useWillUseCloud] Failed to check cloud routing for endpoint:', endpoint, error);
        setWillUseCloud(false);
      }
    };

    // Initial check
    checkCloudRouting();

    // Subscribe to backend status changes to re-check when backend becomes healthy
    const unsubscribe = tauriBackendService.subscribeToStatus((status) => {
      if (status === 'healthy') {
        checkCloudRouting();
      }
    });

    return unsubscribe;
  }, [endpoint]);

  return willUseCloud;
}
