import { useState, useEffect } from 'react';
import { connectionModeService } from '@app/services/connectionModeService';
import { endpointAvailabilityService } from '@app/services/endpointAvailabilityService';
import { tauriBackendService } from '@app/services/tauriBackendService';
import { EXTENSION_TO_ENDPOINT } from '@app/constants/convertConstants';
import { getEndpointName } from '@app/utils/convertUtils';

/**
 * Comprehensive conversion status data
 */
export interface ConversionStatus {
  availability: Record<string, boolean>;   // Available on local OR SaaS?
  cloudStatus: Record<string, boolean>;    // Will use cloud?
  localOnly: Record<string, boolean>;      // Available ONLY locally (not on SaaS)?
}

/**
 * Desktop hook to check conversion availability and cloud routing
 * Returns comprehensive data about each conversion
 * @returns Object with availability, cloudStatus, and localOnly maps
 */
export function useConversionCloudStatus(): ConversionStatus {
  const [status, setStatus] = useState<ConversionStatus>({
    availability: {},
    cloudStatus: {},
    localOnly: {},
  });

  useEffect(() => {
    const checkConversions = async () => {
      // Don't check until backend is healthy
      // This prevents showing incorrect status during startup
      if (!tauriBackendService.isBackendHealthy()) {
        setStatus({ availability: {}, cloudStatus: {}, localOnly: {} });
        return;
      }

      const mode = await connectionModeService.getCurrentMode();
      if (mode !== 'saas') {
        // In non-SaaS modes, local endpoint checking handles everything
        setStatus({ availability: {}, cloudStatus: {}, localOnly: {} });
        return;
      }

      const availability: Record<string, boolean> = {};
      const cloudStatus: Record<string, boolean> = {};
      const localOnly: Record<string, boolean> = {};

      // Collect all conversion pairs first, then check all in parallel
      const pairs: [string, string, string][] = [];
      for (const fromExt of Object.keys(EXTENSION_TO_ENDPOINT)) {
        for (const toExt of Object.keys(EXTENSION_TO_ENDPOINT[fromExt] || {})) {
          const endpointName = getEndpointName(fromExt, toExt);
          if (endpointName) pairs.push([fromExt, toExt, endpointName]);
        }
      }

      const results = await Promise.all(
        pairs.map(async ([fromExt, toExt, endpointName]) => {
          const key = `${fromExt}-${toExt}`;
          try {
            const combined = await endpointAvailabilityService.checkEndpointCombined(
              endpointName,
              tauriBackendService.getBackendUrl()
            );
            return { key, isAvailable: combined.isAvailable, willUseCloud: combined.willUseCloud, localOnly: combined.localOnly };
          } catch (error) {
            console.error(`[useConversionCloudStatus] Endpoint check failed for ${key}:`, error);
            return { key, isAvailable: false, willUseCloud: false, localOnly: false };
          }
        })
      );

      for (const { key, isAvailable, willUseCloud: wuc, localOnly: lo } of results) {
        availability[key] = isAvailable;
        cloudStatus[key] = wuc;
        localOnly[key] = lo;
      }

      setStatus({ availability, cloudStatus, localOnly });
    };

    // Initial check
    checkConversions();

    // Subscribe to backend status changes to re-check when backend becomes healthy
    const unsubscribe = tauriBackendService.subscribeToStatus((status) => {
      if (status === 'healthy') {
        checkConversions();
      }
    });

    return unsubscribe;
  }, []);

  return status;
}
