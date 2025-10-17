import { useState, useCallback, useMemo } from 'react';
import { useToolRegistry } from "../contexts/ToolRegistryContext";
import { getAllEndpoints, type ToolRegistryEntry, type ToolRegistryMap } from "../data/toolsTaxonomy";
import { useMultipleEndpointsEnabled } from "./useEndpointConfig";
import { FileId } from '../types/file';
import { ToolId } from 'src/types/toolId';

interface ToolManagementResult {
  selectedTool: ToolRegistryEntry | null;
  toolSelectedFileIds: FileId[];
  toolRegistry: ToolRegistryMap;
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
    if (endpointsLoading) return true;
    const tool = baseRegistry[toolKey as ToolId];
    const endpoints = tool?.endpoints || [];
    return endpoints.length === 0 || endpoints.some((endpoint: string) => endpointStatus[endpoint] === true);
  }, [endpointsLoading, endpointStatus, baseRegistry]);

  const toolRegistry: ToolRegistryMap = useMemo(() => {
    const availableToolRegistry: ToolRegistryMap = {};
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
