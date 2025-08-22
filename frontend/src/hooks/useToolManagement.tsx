import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useFlatToolRegistry } from "../data/useTranslatedToolRegistry";
import { getAllEndpoints, type ToolRegistryEntry } from "../data/toolsTaxonomy";
import MergeIcon from "@mui/icons-material/Merge";
import { useMultipleEndpointsEnabled } from "./useEndpointConfig";

interface ToolManagementResult {
  selectedTool: ToolRegistryEntry | null;
  toolSelectedFileIds: string[];
  toolRegistry: Record<string, ToolRegistryEntry>;
  setToolSelectedFileIds: (fileIds: string[]) => void;
  getSelectedTool: (toolKey: string | null) => ToolRegistryEntry | null;
}

export const useToolManagement = (): ToolManagementResult => {
  const { t } = useTranslation();

  const [toolSelectedFileIds, setToolSelectedFileIds] = useState<string[]>([]);

  // Build endpoints list from registry entries with fallback to legacy mapping
  const baseRegistry = useFlatToolRegistry();
  const registryDerivedEndpoints = useMemo(() => {
    const endpointsByTool: Record<string, string[]> = {};
    Object.entries(baseRegistry).forEach(([key, entry]) => {
      if (entry.endpoints && entry.endpoints.length > 0) {
        endpointsByTool[key] = entry.endpoints;
      }
    });
    return endpointsByTool;
  }, [baseRegistry]);

  const allEndpoints = useMemo(() => getAllEndpoints(baseRegistry), [baseRegistry]);
  const { endpointStatus, loading: endpointsLoading } = useMultipleEndpointsEnabled(allEndpoints);

  const isToolAvailable = useCallback((toolKey: string): boolean => {
    if (endpointsLoading) return true;
    const endpoints = baseRegistry[toolKey]?.endpoints || [];
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
