import { useState, useCallback, useMemo } from 'react';
import { useToolRegistry } from "@app/contexts/ToolRegistryContext";
import { getAllEndpoints, type ToolRegistryEntry, type ToolRegistry } from "@app/data/toolsTaxonomy";
import { useMultipleEndpointsEnabled } from "@app/hooks/useEndpointConfig";
import { FileId } from '@app/types/file';
import { ToolId } from "@app/types/toolId";

interface ToolManagementResult {
  selectedTool: ToolRegistryEntry | null;
  toolSelectedFileIds: FileId[];
  toolRegistry: Partial<ToolRegistry>;
  setToolSelectedFileIds: (fileIds: FileId[]) => void;
  getSelectedTool: (toolKey: ToolId | null) => ToolRegistryEntry | null;
}

export const useToolManagement = (): ToolManagementResult => {
  const [toolSelectedFileIds, setToolSelectedFileIds] = useState<FileId[]>([]);

  // Build endpoints list from registry entries with fallback to legacy mapping
  const { allTools } = useToolRegistry();
  const baseRegistry = allTools;

  const allEndpoints = useMemo(() => getAllEndpoints(baseRegistry), [baseRegistry]);
  const { endpointStatus, loading: endpointsLoading } = useMultipleEndpointsEnabled(allEndpoints);

  const isToolAvailable = useCallback((toolKey: string): boolean => {
    // Keep tools enabled during loading (optimistic UX)
    if (endpointsLoading) return true;

    const tool = baseRegistry[toolKey as ToolId];
    const endpoints = tool?.endpoints || [];

    // Tools without endpoints are always available
    if (endpoints.length === 0) return true;

    // Check if at least one endpoint is enabled
    // If endpoint is not in status map, assume enabled (optimistic fallback)
    return endpoints.some((endpoint: string) => endpointStatus[endpoint]);
  }, [endpointsLoading, endpointStatus, baseRegistry]);

  const toolRegistry: Partial<ToolRegistry> = useMemo(() => {
    const availableToolRegistry: Partial<ToolRegistry> = {};
    (Object.keys(baseRegistry) as ToolId[]).forEach(toolKey => {
      if (isToolAvailable(toolKey)) {
        const baseTool = baseRegistry[toolKey];
        if (baseTool) {
          availableToolRegistry[toolKey] = {
            ...baseTool,
            name: baseTool.name,
            description: baseTool.description,
          };
        }
      }
    });
    return availableToolRegistry;
  }, [isToolAvailable, baseRegistry]);

  const getSelectedTool = useCallback((toolKey: ToolId | null): ToolRegistryEntry | null => {
    return toolKey ? toolRegistry[toolKey] || null : null;
  }, [toolRegistry]);

  return {
    selectedTool: getSelectedTool(null), // This will be unused, kept for compatibility
    toolSelectedFileIds,
    toolRegistry,
    setToolSelectedFileIds,
    getSelectedTool,
  };
};
