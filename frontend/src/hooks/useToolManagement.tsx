import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import AddToPhotosIcon from "@mui/icons-material/AddToPhotos";
import ContentCutIcon from "@mui/icons-material/ContentCut";
import ZoomInMapIcon from "@mui/icons-material/ZoomInMap";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import SplitPdfPanel from "../tools/Split";
import CompressPdfPanel from "../tools/Compress";
import MergePdfPanel from "../tools/Merge";
import ConvertPanel from "../tools/Convert";
import { useMultipleEndpointsEnabled } from "./useEndpointConfig";

type ToolRegistryEntry = {
  icon: React.ReactNode;
  name: string;
  component: React.ComponentType<any>;
  view: string;
};

type ToolRegistry = {
  [key: string]: ToolRegistryEntry;
};

const baseToolRegistry = {
  split: { icon: <ContentCutIcon />, component: SplitPdfPanel, view: "split" },
  compress: { icon: <ZoomInMapIcon />, component: CompressPdfPanel, view: "compress" },
  merge: { icon: <AddToPhotosIcon />, component: MergePdfPanel, view: "pageEditor" },
  convert: { icon: <SwapHorizIcon />, component: ConvertPanel, view: "convert" },
};

// Tool endpoint mappings
const toolEndpoints: Record<string, string[]> = {
  split: ["split-pages", "split-pdf-by-sections", "split-by-size-or-count", "split-pdf-by-chapters"],
  compress: ["compress-pdf"],
  merge: ["merge-pdfs"],
  convert: ["pdf-to-img", "img-to-pdf", "pdf-to-word", "pdf-to-presentation", "pdf-to-text", "pdf-to-html", "pdf-to-xml", "html-to-pdf", "markdown-to-pdf", "file-to-pdf"],
};


export const useToolManagement = () => {
  const { t } = useTranslation();

  const [selectedToolKey, setSelectedToolKey] = useState<string | null>(null);
  const [toolSelectedFileIds, setToolSelectedFileIds] = useState<string[]>([]);

  const allEndpoints = Array.from(new Set(Object.values(toolEndpoints).flat()));
  const { endpointStatus, loading: endpointsLoading } = useMultipleEndpointsEnabled(allEndpoints);

  const isToolAvailable = useCallback((toolKey: string): boolean => {
    if (endpointsLoading) return true;
    const endpoints = toolEndpoints[toolKey] || [];
    return endpoints.some(endpoint => endpointStatus[endpoint] === true);
  }, [endpointsLoading, endpointStatus]);

  const toolRegistry: ToolRegistry = useMemo(() => {
    const availableToolRegistry: ToolRegistry = {};
    Object.keys(baseToolRegistry).forEach(toolKey => {
      if (isToolAvailable(toolKey)) {
        availableToolRegistry[toolKey] = {
          ...baseToolRegistry[toolKey as keyof typeof baseToolRegistry],
          name: t(`home.${toolKey}.title`, toolKey.charAt(0).toUpperCase() + toolKey.slice(1))
        };
      }
    });
    return availableToolRegistry;
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
