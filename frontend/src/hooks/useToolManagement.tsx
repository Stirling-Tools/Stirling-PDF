import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useFlatToolRegistry } from "../data/useTranslatedToolRegistry";
import { getAllEndpoints, type ToolRegistryEntry, type ToolRegistry } from "../data/toolsTaxonomy";
import { useMultipleEndpointsEnabled } from "./useEndpointConfig";
import { FileId } from '../types/file';
import { ToolId } from 'src/types/toolId';

interface ToolManagementResult {
  selectedTool: ToolRegistryEntry | null;
  toolSelectedFileIds: FileId[];
  toolRegistry: Partial<ToolRegistry>;
  setToolSelectedFileIds: (fileIds: FileId[]) => void;
  getSelectedTool: (toolKey: ToolId | null) => ToolRegistryEntry | null;
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

  const toolRegistry: Partial<ToolRegistry> = useMemo(() => {
    const availableToolRegistry: Partial<ToolRegistry> = {};
    (Object.keys(baseRegistry) as ToolId[]).forEach(toolKey => {
      if (isToolAvailable(toolKey)) {
        const baseTool = baseRegistry[toolKey as keyof typeof baseRegistry];
        availableToolRegistry[toolKey as ToolId] = {
          ...baseTool,
          name: baseTool.name,
          description: baseTool.description,
        };
      }
    });
    return availableToolRegistry;
  }, [isToolAvailable, t, baseRegistry]);

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
