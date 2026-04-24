import { useState, useEffect } from "react";
import { connectionModeService } from "@app/services/connectionModeService";
import { endpointAvailabilityService } from "@app/services/endpointAvailabilityService";
import { tauriBackendService } from "@app/services/tauriBackendService";
import { selfHostedServerMonitor } from "@app/services/selfHostedServerMonitor";
import { EXTENSION_TO_ENDPOINT } from "@app/constants/convertConstants";
import { getEndpointName } from "@app/utils/convertUtils";

/**
 * Comprehensive conversion status data
 */
export interface ConversionStatus {
  availability: Record<string, boolean>; // Available on local OR SaaS?
  cloudStatus: Record<string, boolean>; // Will use cloud?
  localOnly: Record<string, boolean>; // Available ONLY locally (not on SaaS)?
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
      const mode = await connectionModeService.getCurrentMode();

      // Self-hosted offline path: server is down but local backend is available.
      // Check each conversion against the local backend only (no cloud routing).
      if (mode === "selfhosted") {
        const { status } = selfHostedServerMonitor.getSnapshot();
        const localUrl = tauriBackendService.getBackendUrl();
        if (status === "offline" && localUrl) {
          const pairs: [string, string, string][] = [];
          for (const fromExt of Object.keys(EXTENSION_TO_ENDPOINT)) {
            for (const toExt of Object.keys(
              EXTENSION_TO_ENDPOINT[fromExt] || {},
            )) {
              const endpointName = getEndpointName(fromExt, toExt);
              if (endpointName) pairs.push([fromExt, toExt, endpointName]);
            }
          }
          const availability: Record<string, boolean> = {};
          const cloudStatus: Record<string, boolean> = {};
          const localOnly: Record<string, boolean> = {};
          const results = await Promise.all(
            pairs.map(async ([fromExt, toExt, endpointName]) => {
              const key = `${fromExt}-${toExt}`;
              try {
                const supported =
                  await endpointAvailabilityService.isEndpointSupportedLocally(
                    endpointName,
                    localUrl,
                  );
                return { key, supported };
              } catch {
                return { key, supported: false };
              }
            }),
          );
          for (const { key, supported } of results) {
            availability[key] = supported;
            cloudStatus[key] = false;
            localOnly[key] = supported;
          }
          setStatus({ availability, cloudStatus, localOnly });
          return;
        }
        // Server online or local not ready: let normal endpoint checking handle it
        setStatus({ availability: {}, cloudStatus: {}, localOnly: {} });
        return;
      }

      // Don't check until backend is healthy (SaaS startup guard)
      if (!tauriBackendService.isOnline) {
        setStatus({ availability: {}, cloudStatus: {}, localOnly: {} });
        return;
      }

      if (mode !== "saas") {
        // Non-SaaS, non-self-hosted: local endpoint checking handles everything
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
            // In SaaS mode, everything is available (locally or via cloud routing).
            // Only check local support to determine willUseCloud — the same approach
            // used by useMultipleEndpointsEnabled's SaaS enhancement.
            const availableLocally =
              await endpointAvailabilityService.isEndpointSupportedLocally(
                endpointName,
                tauriBackendService.getBackendUrl(),
              );
            return {
              key,
              isAvailable: true,
              willUseCloud: !availableLocally,
              localOnly: false,
            };
          } catch (error) {
            console.error(
              `[useConversionCloudStatus] Endpoint check failed for ${key}:`,
              error,
            );
            // On error, assume available via cloud (safe default in SaaS mode)
            return {
              key,
              isAvailable: true,
              willUseCloud: true,
              localOnly: false,
            };
          }
        }),
      );

      for (const {
        key,
        isAvailable,
        willUseCloud: wuc,
        localOnly: lo,
      } of results) {
        availability[key] = isAvailable;
        cloudStatus[key] = wuc;
        localOnly[key] = lo;
      }

      setStatus({ availability, cloudStatus, localOnly });
    };

    // Initial check
    checkConversions();

    // Re-check when SaaS local backend becomes healthy
    const unsubLocal = tauriBackendService.subscribeToStatus((status) => {
      if (status === "healthy") {
        checkConversions();
      }
    });

    // Re-check when self-hosted server goes offline or comes back online.
    // By the time the server is confirmed offline, the local port is already
    // discovered (waitForPort completes in ~500ms vs the 8s server poll timeout).
    // selfHostedServerMonitor.subscribe immediately invokes the listener with the
    // current state, which would cause a duplicate check alongside the one above.
    // Skip the first invocation since checkConversions() was already called above.
    let skipFirst = true;
    const unsubServer = selfHostedServerMonitor.subscribe(() => {
      if (skipFirst) {
        skipFirst = false;
        return;
      }
      void checkConversions();
    });

    return () => {
      unsubLocal();
      unsubServer();
    };
  }, []);

  return status;
}
