import { useState, useEffect } from 'react';
import { connectionModeService } from '@app/services/connectionModeService';
import { endpointAvailabilityService } from '@app/services/endpointAvailabilityService';
import { tauriBackendService } from '@app/services/tauriBackendService';

/**
 * Desktop hook to check if a tool endpoint will use cloud backend
 * @param endpointName - The endpoint name to check (e.g., 'ocr-pdf', 'compress-pdf')
 * @returns true if the tool will use cloud credits, false otherwise
 */
export function useToolCloudStatus(endpointName?: string): boolean {
  const [usesCloud, setUsesCloud] = useState(false);

  useEffect(() => {
    const checkCloudRouting = async () => {
      if (!endpointName) {
        setUsesCloud(false);
        return;
      }

      try {
        // Don't show cloud badges until backend is healthy
        // This prevents showing incorrect cloud status during startup
        if (!tauriBackendService.isBackendHealthy()) {
          setUsesCloud(false);
          return;
        }

        // Check if in SaaS mode
        const mode = await connectionModeService.getCurrentMode();
        if (mode !== 'saas') {
          setUsesCloud(false);
          return;
        }

        // Check if supported on SaaS first (if not, no point showing cloud badge)
        const supportedOnSaaS = await endpointAvailabilityService.isEndpointSupportedOnSaaS(endpointName);

        if (!supportedOnSaaS) {
          // Not available on SaaS, don't show cloud badge
          setUsesCloud(false);
          return;
        }

        // Available on SaaS, check if also available locally
        const supportedLocally = await endpointAvailabilityService.isEndpointSupportedLocally(endpointName);
        // Show cloud badge only if SaaS supports it but local doesn't
        setUsesCloud(!supportedLocally);
      } catch {
        setUsesCloud(false);
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
  }, [endpointName]);

  return usesCloud;
}
