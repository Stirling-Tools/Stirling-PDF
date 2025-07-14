import React, { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import AddToPhotosIcon from "@mui/icons-material/AddToPhotos";
import ContentCutIcon from "@mui/icons-material/ContentCut";
import ZoomInMapIcon from "@mui/icons-material/ZoomInMap";
import SplitPdfPanel from "../tools/Split";
import CompressPdfPanel from "../tools/Compress";
import MergePdfPanel from "../tools/Merge";

type ToolRegistryEntry = {
  icon: React.ReactNode;
  name: string;
  component: React.ComponentType<any>;
  view: string;
};

type ToolRegistry = {
  [key: string]: ToolRegistryEntry;
};

// Base tool registry without translations
const baseToolRegistry = {
  split: { icon: <ContentCutIcon />, component: SplitPdfPanel, view: "split" },
  compress: { icon: <ZoomInMapIcon />, component: CompressPdfPanel, view: "viewer" },
  merge: { icon: <AddToPhotosIcon />, component: MergePdfPanel, view: "pageEditor" },
};

// Tool parameter defaults
const getToolDefaults = (toolKey: string) => {
  switch (toolKey) {
    case 'split':
      return {
        mode: '',
        pages: '',
        hDiv: '2',
        vDiv: '2',
        merge: false,
        splitType: 'size',
        splitValue: '',
        bookmarkLevel: '1',
        includeMetadata: false,
        allowDuplicates: false,
      };
    case 'compress':
      return {
        quality: 80,
        imageCompression: true,
        removeMetadata: false
      };
    case 'merge':
      return {
        sortOrder: 'name',
        includeMetadata: true
      };
    default:
      return {};
  }
};

export const useToolManagement = () => {
  const { t } = useTranslation();
  
  const [selectedToolKey, setSelectedToolKey] = useState<string | null>(null);
  const [toolSelectedFileIds, setToolSelectedFileIds] = useState<string[]>([]);
  const [toolParams, setToolParams] = useState<Record<string, any>>({});

  // Tool registry with translations
  const toolRegistry: ToolRegistry = useMemo(() => ({
    split: { ...baseToolRegistry.split, name: t("home.split.title", "Split PDF") },
    compress: { ...baseToolRegistry.compress, name: t("home.compressPdfs.title", "Compress PDF") },
    merge: { ...baseToolRegistry.merge, name: t("home.merge.title", "Merge PDFs") },
  }), [t]);

  // Get tool parameters with defaults
  const getToolParams = useCallback((toolKey: string | null) => {
    if (!toolKey) return {};
    
    const storedParams = toolParams[toolKey] || {};
    const defaultParams = getToolDefaults(toolKey);
    
    return { ...defaultParams, ...storedParams };
  }, [toolParams]);

  // Update tool parameters
  const updateToolParams = useCallback((toolKey: string, newParams: any) => {
    setToolParams(prev => ({
      ...prev,
      [toolKey]: {
        ...prev[toolKey],
        ...newParams
      }
    }));
  }, []);

  // Select tool
  const selectTool = useCallback((toolKey: string) => {
    setSelectedToolKey(toolKey);
  }, []);

  // Clear tool selection
  const clearToolSelection = useCallback(() => {
    setSelectedToolKey(null);
  }, []);

  // Get currently selected tool
  const selectedTool = selectedToolKey ? toolRegistry[selectedToolKey] : null;

  return {
    // State
    selectedToolKey,
    selectedTool,
    toolSelectedFileIds,
    toolParams: getToolParams(selectedToolKey),
    toolRegistry,
    
    // Actions
    selectTool,
    clearToolSelection,
    updateToolParams: (newParams: any) => {
      if (selectedToolKey) {
        updateToolParams(selectedToolKey, newParams);
      }
    },
    setToolSelectedFileIds,
    
    // Utilities
    getToolParams,
  };
};