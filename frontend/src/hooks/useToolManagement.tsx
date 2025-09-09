import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useFlatToolRegistry } from "../data/useTranslatedToolRegistry";
import { getAllEndpoints, type ToolRegistryEntry } from "../data/toolsTaxonomy";
import { useMultipleEndpointsEnabled } from "./useEndpointConfig";
import { FileId } from '../types/file';

interface ToolManagementResult {
  selectedTool: ToolRegistryEntry | null;
  toolSelectedFileIds: FileId[];
  toolRegistry: Record<string, ToolRegistryEntry>;
  setToolSelectedFileIds: (fileIds: FileId[]) => void;
  getSelectedTool: (toolKey: string | null) => ToolRegistryEntry | null;
}

export const useToolManagement = (): ToolManagementResult => {
  const { t } = useTranslation();

  const [toolSelectedFileIds, setToolSelectedFileIds] = useState<FileId[]>([]);

  // Build endpoints list from registry entries with fallback to legacy mapping
  const baseRegistry = useFlatToolRegistry();

  const allEndpoints = useMemo(() => getAllEndpoints(baseRegistry), [baseRegistry]);
  const { endpointStatus, loading: endpointsLoading } = useMultipleEndpointsEnabled(allEndpoints);

  const isToolAvailable = useCallback((toolKey: string): boolean => {
    if (endpointsLoading) return true;
    const endpoints = baseRegistry[toolKey as keyof typeof baseRegistry]?.endpoints || [];
    return endpoints.length === 0 || endpoints.some((endpoint: string) => endpointStatus[endpoint] === true);
  }, [endpointsLoading, endpointStatus, baseRegistry]);

  const toolRegistry: Record<string, ToolRegistryEntry> = useMemo(() => {
    const availableToolRegistry: Record<string, ToolRegistryEntry> = {};
    Object.keys(baseRegistry).forEach(toolKey => {
      if (isToolAvailable(toolKey)) {
        const baseTool = baseRegistry[toolKey as keyof typeof baseRegistry];
        availableToolRegistry[toolKey] = {
          ...baseTool,
          name: baseTool.name,
          description: baseTool.description,
        };
      }
    });
    return availableToolRegistry;
  }, [isToolAvailable, t, baseRegistry]);

  const getSelectedTool = useCallback((toolKey: string | null): ToolRegistryEntry | null => {
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
