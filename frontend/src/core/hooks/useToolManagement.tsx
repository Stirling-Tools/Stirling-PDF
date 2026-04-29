import { useState, useCallback, useMemo } from "react";
import { useToolRegistry } from "@app/contexts/ToolRegistryContext";
import { usePreferences } from "@app/contexts/PreferencesContext";
import {
  getAllEndpoints,
  type ToolRegistryEntry,
  type ToolRegistry,
} from "@app/data/toolsTaxonomy";
import { useMultipleEndpointsEnabled } from "@app/hooks/useEndpointConfig";
import { useSelfHostedToolAvailability } from "@app/hooks/useSelfHostedToolAvailability";
import { useSaaSMode } from "@app/hooks/useSaaSMode";
import { FileId } from "@app/types/file";
import { ToolId } from "@app/types/toolId";
import type { EndpointDisableReason } from "@app/types/endpointAvailability";

export type ToolDisableCause =
  | "disabledByAdmin"
  | "missingDependency"
  | "unknown"
  | "selfHostedOffline";

export interface ToolAvailabilityInfo {
  available: boolean;
  reason?: ToolDisableCause;
}

export type ToolAvailabilityMap = Partial<Record<ToolId, ToolAvailabilityInfo>>;

interface ToolManagementResult {
  selectedTool: ToolRegistryEntry | null;
  toolSelectedFileIds: FileId[];
  toolRegistry: Partial<ToolRegistry>;
  setToolSelectedFileIds: (fileIds: FileId[]) => void;
  getSelectedTool: (toolKey: ToolId | null) => ToolRegistryEntry | null;
  toolAvailability: ToolAvailabilityMap;
}

export const useToolManagement = (): ToolManagementResult => {
  const [toolSelectedFileIds, setToolSelectedFileIds] = useState<FileId[]>([]);

  const { allTools } = useToolRegistry();
  const baseRegistry = allTools;
  const { preferences } = usePreferences();
  const isSaaSMode = useSaaSMode();

  const allEndpoints = useMemo(
    () => getAllEndpoints(baseRegistry),
    [baseRegistry],
  );
  const {
    endpointStatus,
    endpointDetails,
    loading: endpointsLoading,
  } = useMultipleEndpointsEnabled(allEndpoints);

  const toolEndpointList = useMemo(
    () =>
      (Object.keys(baseRegistry) as ToolId[])
        // Exclude coming-soon tools (no component and no link) — they are already
        // unavailable regardless of server state and should not appear in the
        // self-hosted offline banner.
        .filter((id) => {
          const tool = baseRegistry[id];
          return !!(tool?.component ?? tool?.link);
        })
        .map((id) => ({
          id,
          endpoints: baseRegistry[id]?.endpoints ?? [],
        })),
    [baseRegistry],
  );
  const selfHostedOfflineIds = useSelfHostedToolAvailability(toolEndpointList);

  const isToolAvailable = useCallback(
    (toolKey: string): boolean => {
      // Self-hosted offline check must come before the loading gate:
      // in self-hosted offline mode endpointsLoading stays true indefinitely
      // (health check never resolves), so checking it first would wrongly
      // keep all tools enabled.
      if (selfHostedOfflineIds.has(toolKey)) return false;

      // Keep tools enabled while endpoint status is loading (optimistic UX)
      if (endpointsLoading) return true;

      const tool = baseRegistry[toolKey as ToolId];
      const endpoints = tool?.endpoints || [];

      if (endpoints.length === 0) return true;

      const hasLocalSupport = endpoints.some(
        (endpoint: string) => endpointStatus[endpoint] !== false,
      );

      // In SaaS mode tools without local support can route to the cloud backend
      if (!hasLocalSupport && isSaaSMode) return true;

      return hasLocalSupport;
    },
    [
      endpointsLoading,
      endpointStatus,
      baseRegistry,
      isSaaSMode,
      selfHostedOfflineIds,
    ],
  );

  const deriveToolDisableReason = useCallback(
    (toolKey: ToolId): ToolDisableCause => {
      if (selfHostedOfflineIds.has(toolKey)) {
        return "selfHostedOffline";
      }

      const tool = baseRegistry[toolKey];
      if (!tool) {
        return "unknown";
      }
      const endpoints = tool.endpoints || [];
      const disabledReasons: EndpointDisableReason[] = endpoints
        .filter((endpoint) => endpointStatus[endpoint] === false)
        .map((endpoint) => endpointDetails[endpoint]?.reason ?? "CONFIG");

      if (disabledReasons.some((reason) => reason === "DEPENDENCY")) {
        return "missingDependency";
      }
      if (disabledReasons.some((reason) => reason === "CONFIG")) {
        return "disabledByAdmin";
      }
      if (disabledReasons.length > 0) {
        return "unknown";
      }
      return "unknown";
    },
    [baseRegistry, endpointDetails, endpointStatus, selfHostedOfflineIds],
  );

  const toolAvailability = useMemo(() => {
    // Skip computation during loading UNLESS some tools are already known offline.
    // In self-hosted offline mode endpointsLoading never clears, so we must still
    // compute the map to surface the selfHostedOfflineIds set.
    if (endpointsLoading && selfHostedOfflineIds.size === 0) {
      return {};
    }
    const availability: ToolAvailabilityMap = {};
    (Object.keys(baseRegistry) as ToolId[]).forEach((toolKey) => {
      const available = isToolAvailable(toolKey);
      availability[toolKey] = available
        ? { available: true }
        : { available: false, reason: deriveToolDisableReason(toolKey) };
    });
    return availability;
  }, [
    baseRegistry,
    deriveToolDisableReason,
    endpointsLoading,
    isToolAvailable,
    selfHostedOfflineIds,
  ]);

  const toolRegistry: Partial<ToolRegistry> = useMemo(() => {
    const availableToolRegistry: Partial<ToolRegistry> = {};
    (Object.keys(baseRegistry) as ToolId[]).forEach((toolKey) => {
      const baseTool = baseRegistry[toolKey];
      if (!baseTool) return;
      const availabilityInfo = toolAvailability[toolKey];
      const isAvailable = availabilityInfo
        ? availabilityInfo.available !== false
        : true;

      // Check if tool is "coming soon" (has no component and no link)
      const isComingSoon =
        !baseTool.component &&
        !baseTool.link &&
        toolKey !== "read" &&
        toolKey !== "multiTool";

      if (preferences.hideUnavailableTools && (!isAvailable || isComingSoon)) {
        return;
      }
      availableToolRegistry[toolKey] = {
        ...baseTool,
        name: baseTool.name,
        description: baseTool.description,
      };
    });
    return availableToolRegistry;
  }, [baseRegistry, preferences.hideUnavailableTools, toolAvailability]);

  const getSelectedTool = useCallback(
    (toolKey: ToolId | null): ToolRegistryEntry | null => {
      return toolKey ? toolRegistry[toolKey] || null : null;
    },
    [toolRegistry],
  );

  return {
    selectedTool: getSelectedTool(null),
    toolSelectedFileIds,
    toolRegistry,
    setToolSelectedFileIds,
    getSelectedTool,
    toolAvailability,
  };
};
