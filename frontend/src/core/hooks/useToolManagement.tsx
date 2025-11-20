import { useState, useCallback, useMemo } from 'react';
import { useToolRegistry } from "@app/contexts/ToolRegistryContext";
import { usePreferences } from '@app/contexts/PreferencesContext';
import { getAllEndpoints, type ToolRegistryEntry, type ToolRegistry } from "@app/data/toolsTaxonomy";
import { useMultipleEndpointsEnabled } from "@app/hooks/useEndpointConfig";
import { FileId } from '@app/types/file';
import { ToolId } from "@app/types/toolId";
import type { EndpointDisableReason } from '@app/types/endpointAvailability';

export type ToolDisableCause = 'disabledByAdmin' | 'missingDependency' | 'unknown';

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

  // Build endpoints list from registry entries with fallback to legacy mapping
  const { allTools } = useToolRegistry();
  const baseRegistry = allTools;
  const { preferences } = usePreferences();

  const allEndpoints = useMemo(() => getAllEndpoints(baseRegistry), [baseRegistry]);
  const { endpointStatus, endpointDetails, loading: endpointsLoading } = useMultipleEndpointsEnabled(allEndpoints);

  const isToolAvailable = useCallback((toolKey: string): boolean => {
    // Keep tools enabled during loading (optimistic UX)
    if (endpointsLoading) return true;

    const tool = baseRegistry[toolKey as ToolId];
    const endpoints = tool?.endpoints || [];

    // Tools without endpoints are always available
    if (endpoints.length === 0) return true;

    // Check if at least one endpoint is enabled
    // If endpoint is not in status map, assume enabled (optimistic fallback)
    return endpoints.some((endpoint: string) => endpointStatus[endpoint] !== false);
  }, [endpointsLoading, endpointStatus, baseRegistry]);

  const deriveToolDisableReason = useCallback((toolKey: ToolId): ToolDisableCause => {
    const tool = baseRegistry[toolKey];
    if (!tool) {
      return 'unknown';
    }
    const endpoints = tool.endpoints || [];
    const disabledReasons: EndpointDisableReason[] = endpoints
      .filter(endpoint => endpointStatus[endpoint] === false)
      .map(endpoint => endpointDetails[endpoint]?.reason ?? 'CONFIG');

    if (disabledReasons.some(reason => reason === 'DEPENDENCY')) {
      return 'missingDependency';
    }
    if (disabledReasons.some(reason => reason === 'CONFIG')) {
      return 'disabledByAdmin';
    }
    if (disabledReasons.length > 0) {
      return 'unknown';
    }
    return 'unknown';
  }, [baseRegistry, endpointDetails, endpointStatus]);

  const toolAvailability = useMemo(() => {
    if (endpointsLoading) {
      return {};
    }
    const availability: ToolAvailabilityMap = {};
    (Object.keys(baseRegistry) as ToolId[]).forEach(toolKey => {
      const available = isToolAvailable(toolKey);
      availability[toolKey] = available
        ? { available: true }
        : { available: false, reason: deriveToolDisableReason(toolKey) };
    });
    return availability;
  }, [baseRegistry, deriveToolDisableReason, endpointsLoading, isToolAvailable]);

  const toolRegistry: Partial<ToolRegistry> = useMemo(() => {
    const availableToolRegistry: Partial<ToolRegistry> = {};
    (Object.keys(baseRegistry) as ToolId[]).forEach(toolKey => {
      const baseTool = baseRegistry[toolKey];
      if (!baseTool) return;
      const availabilityInfo = toolAvailability[toolKey];
      const isAvailable = availabilityInfo ? availabilityInfo.available !== false : true;

      // Check if tool is "coming soon" (has no component and no link)
      const isComingSoon = !baseTool.component && !baseTool.link && toolKey !== 'read' && toolKey !== 'multiTool';

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

  const getSelectedTool = useCallback((toolKey: ToolId | null): ToolRegistryEntry | null => {
    return toolKey ? toolRegistry[toolKey] || null : null;
  }, [toolRegistry]);

  return {
    selectedTool: getSelectedTool(null), // This will be unused, kept for compatibility
    toolSelectedFileIds,
    toolRegistry,
    setToolSelectedFileIds,
    getSelectedTool,
    toolAvailability,
  };
};
