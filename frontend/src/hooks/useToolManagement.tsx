import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useFlatToolRegistry } from "../data/useTranslatedToolRegistry";
import { getAllEndpoints, ToolId, type ToolRegistryEntry } from "../data/toolsTaxonomy";
import { useMultipleEndpointsEnabled } from "./useEndpointConfig";

interface ToolManagementResult {
  selectedToolKey: ToolId | null;
  selectedTool: ToolRegistryEntry | null;
  toolSelectedFileIds: string[];
  toolRegistry: Record<string, ToolRegistryEntry>;
  selectTool: (toolKey: ToolId) => void;
  clearToolSelection: () => void;
  setToolSelectedFileIds: (fileIds: string[]) => void;
}

export const useToolManagement = (): ToolManagementResult => {
  const { t } = useTranslation();

  const [selectedToolKey, setSelectedToolKey] = useState<ToolId | null>(null);
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

  const isToolAvailable = useCallback((toolKey: ToolId): boolean => {
    if (endpointsLoading) return true;
    const endpoints = baseRegistry[toolKey]?.endpoints || [];
    return endpoints.length === 0 || endpoints.some((endpoint: string) => endpointStatus[endpoint] === true);
  }, [endpointsLoading, endpointStatus, baseRegistry]);

  const toolRegistry: Record<string, ToolRegistryEntry> = useMemo(() => {
    const availableToolRegistry: Record<string, ToolRegistryEntry> = {};
    (Object.keys(baseRegistry) as ToolId[]).forEach(toolKey => {
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

  useEffect(() => {
    if (!endpointsLoading && selectedToolKey && !toolRegistry[selectedToolKey]) {
      const firstAvailableTool = (Object.keys(toolRegistry) as ToolId[])[0];
      if (firstAvailableTool) {
        setSelectedToolKey(firstAvailableTool);
      } else {
        setSelectedToolKey(null);
      }
    }
  }, [endpointsLoading, selectedToolKey, toolRegistry]);

  const selectTool = useCallback((toolKey: ToolId) => {
    setSelectedToolKey(toolKey);
  }, []);

  const clearToolSelection = useCallback(() => {
    setSelectedToolKey(null);
  }, []);

  const selectedTool = selectedToolKey ? toolRegistry[selectedToolKey] : null;

  return {
    selectedToolKey,
    selectedTool,
    toolSelectedFileIds,
    toolRegistry,
    selectTool,
    clearToolSelection,
    setToolSelectedFileIds,

  };
};
