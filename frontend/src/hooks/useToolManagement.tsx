import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getFlatToolRegistry, toolEndpoints, type ToolRegistryEntry } from "../data/toolRegistry";
import { useMultipleEndpointsEnabled } from "./useEndpointConfig";

interface ToolManagementResult {
  selectedToolKey: string | null;
  selectedTool: ToolRegistryEntry | null;
  toolSelectedFileIds: string[];
  toolRegistry: Record<string, ToolRegistryEntry>;
  selectTool: (toolKey: string) => void;
  clearToolSelection: () => void;
  setToolSelectedFileIds: (fileIds: string[]) => void;
}

export const useToolManagement = (): ToolManagementResult => {
  const { t } = useTranslation();

  const [selectedToolKey, setSelectedToolKey] = useState<string | null>(null);
  const [toolSelectedFileIds, setToolSelectedFileIds] = useState<string[]>([]);

  const allEndpoints = Array.from(new Set(
    Object.values(toolEndpoints).flat() as string[]
  ));
  const { endpointStatus, loading: endpointsLoading } = useMultipleEndpointsEnabled(allEndpoints);

  const isToolAvailable = useCallback((toolKey: string): boolean => {
    if (endpointsLoading) return true;
    const endpoints = toolEndpoints[toolKey] || [];
    return endpoints.length === 0 || endpoints.some((endpoint: string) => endpointStatus[endpoint] === true);
  }, [endpointsLoading, endpointStatus]);

  const toolRegistry: Record<string, ToolRegistryEntry> = useMemo(() => {
    const availableToolRegistry: Record<string, ToolRegistryEntry> = {};
    const base = getFlatToolRegistry();
    Object.keys(base).forEach(toolKey => {
      if (isToolAvailable(toolKey)) {
        const baseTool = base[toolKey as keyof typeof base];
        availableToolRegistry[toolKey] = {
          ...baseTool,
          name: t(baseTool.name),
          description: t(baseTool.description)
        };
      }
    });
    return availableToolRegistry;
  }, [isToolAvailable, t]);

  useEffect(() => {
    if (!endpointsLoading && selectedToolKey && !toolRegistry[selectedToolKey]) {
      const firstAvailableTool = Object.keys(toolRegistry)[0];
      if (firstAvailableTool) {
        setSelectedToolKey(firstAvailableTool);
      } else {
        setSelectedToolKey(null);
      }
    }
  }, [endpointsLoading, selectedToolKey, toolRegistry]);

  const selectTool = useCallback((toolKey: string) => {
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
