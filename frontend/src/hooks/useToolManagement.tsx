import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import ContentCutIcon from "@mui/icons-material/ContentCut";
import ZoomInMapIcon from "@mui/icons-material/ZoomInMap";
import ApiIcon from "@mui/icons-material/Api";
import { useMultipleEndpointsEnabled } from "./useEndpointConfig";
import { Tool, ToolDefinition, BaseToolProps, ToolRegistry } from "../types/tool";


// Add entry here with maxFiles, endpoints, and lazy component
const toolDefinitions: Record<string, ToolDefinition> = {
  split: {
    id: "split",
    icon: <ContentCutIcon />,
    component: React.lazy(() => import("../tools/Split")),
    maxFiles: 1,
    category: "manipulation",
    description: "Split PDF files into smaller parts",
    endpoints: ["split-pages", "split-pdf-by-sections", "split-by-size-or-count", "split-pdf-by-chapters"]
  },
  compress: {
    id: "compress",
    icon: <ZoomInMapIcon />,
    component: React.lazy(() => import("../tools/Compress")),
    maxFiles: -1,
    category: "optimization",
    description: "Reduce PDF file size",
    endpoints: ["compress-pdf"]
  },
  swagger: {
    id: "swagger",
    icon: <ApiIcon />,
    component: React.lazy(() => import("../tools/SwaggerUI")),
    maxFiles: 0,
    category: "utility",
    description: "Open API documentation",
    endpoints: ["swagger-ui"]
  },
  ocr: {
    id: "ocr",
    icon: <span className="material-symbols-rounded font-size-20">
      quick_reference_all
    </span>,
    component: React.lazy(() => import("../tools/OCR")),
    maxFiles: -1,
    category: "utility",
    description: "Extract text from images using OCR",
    endpoints: ["ocr-pdf"]
  },

};


interface ToolManagementResult {
  selectedToolKey: string | null;
  selectedTool: Tool | null;
  toolSelectedFileIds: string[];
  toolRegistry: ToolRegistry;
  selectTool: (toolKey: string) => void;
  clearToolSelection: () => void;
  setToolSelectedFileIds: (fileIds: string[]) => void;
}

export const useToolManagement = (): ToolManagementResult => {
  const { t } = useTranslation();

  const [selectedToolKey, setSelectedToolKey] = useState<string | null>(null);
  const [toolSelectedFileIds, setToolSelectedFileIds] = useState<string[]>([]);

  const allEndpoints = Array.from(new Set(
    Object.values(toolDefinitions).flatMap(tool => tool.endpoints || [])
  ));
  const { endpointStatus, loading: endpointsLoading } = useMultipleEndpointsEnabled(allEndpoints);

  const isToolAvailable = useCallback((toolKey: string): boolean => {
    if (endpointsLoading) return true;
    const tool = toolDefinitions[toolKey];
    if (!tool?.endpoints) return true;
    return tool.endpoints.some(endpoint => endpointStatus[endpoint] === true);
  }, [endpointsLoading, endpointStatus]);

  const toolRegistry: ToolRegistry = useMemo(() => {
    const availableTools: ToolRegistry = {};
    Object.keys(toolDefinitions).forEach(toolKey => {
      if (isToolAvailable(toolKey)) {
        const toolDef = toolDefinitions[toolKey];
        availableTools[toolKey] = {
          ...toolDef,
          name: t(`home.${toolKey}.title`, toolKey.charAt(0).toUpperCase() + toolKey.slice(1))
        };
      }
    });
    return availableTools;
  }, [t, isToolAvailable]);

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
