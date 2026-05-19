import { useState, useEffect, useRef } from "react";
import { connectionModeService } from "@app/services/connectionModeService";
import { tauriBackendService } from "@app/services/tauriBackendService";
import { selfHostedServerMonitor } from "@app/services/selfHostedServerMonitor";
import { endpointAvailabilityService } from "@app/services/endpointAvailabilityService";

/**
 * Desktop implementation of useSelfHostedToolAvailability.
 * Returns the set of tool IDs that are unavailable when the self-hosted server
 * is offline (tools whose endpoints are not supported by the local bundled backend).
 *
 * Returns an empty set when:
 *  - Not in self-hosted mode
 *  - Self-hosted server is online
 *  - Local backend port is not yet known
 */
export function useSelfHostedToolAvailability(
  tools: Array<{ id: string; endpoints?: string[] }>,
): Set<string> {
  const [unavailableIds, setUnavailableIds] = useState<Set<string>>(new Set());
  // Keep a stable ref to the latest tools list to avoid unnecessary re-subscriptions
  const toolsRef = useRef(tools);
  toolsRef.current = tools;

  useEffect(() => {
    let cancelled = false;

    const computeUnavailableTools = async () => {
      const mode = await connectionModeService.getCurrentMode();
      if (mode !== "selfhosted") {
        setUnavailableIds(new Set());
        return;
      }

      const { status } = selfHostedServerMonitor.getSnapshot();
      if (status !== "offline") {
        // Idle or checking — not yet confirmed offline; don't mark anything unavailable
        if (!cancelled) setUnavailableIds(new Set());
        return;
      }

      const localUrl = tauriBackendService.getBackendUrl();
      if (!localUrl) {
        // Local backend port not yet known; can't determine unavailable tools yet
        if (!cancelled) setUnavailableIds(new Set());
        return;
      }

      // For each tool, check whether at least one of its endpoints is supported locally
      const unavailable = new Set<string>();
      await Promise.all(
        toolsRef.current.map(async (tool) => {
          const endpoints = tool.endpoints ?? [];
          if (endpoints.length === 0) return; // No endpoints → always available

          const locallySupported = await Promise.all(
            endpoints.map((ep) =>
              endpointAvailabilityService.isEndpointSupportedLocally(
                ep,
                localUrl,
              ),
            ),
          );

          if (!locallySupported.some(Boolean)) {
            unavailable.add(tool.id);
          }
        }),
      );

      if (!cancelled) setUnavailableIds(unavailable);
    };

    // Re-compute when server status changes
    const unsubServer = selfHostedServerMonitor.subscribe(() => {
      void computeUnavailableTools();
    });

    // Re-compute when local backend becomes healthy (port discovered)
    const unsubBackend = tauriBackendService.subscribeToStatus(() => {
      void computeUnavailableTools();
    });

    // Initial computation
    void computeUnavailableTools();

    return () => {
      cancelled = true;
      unsubServer();
      unsubBackend();
    };
  }, []); // tools intentionally omitted — accessed via ref to avoid churn

  return unavailableIds;
}
