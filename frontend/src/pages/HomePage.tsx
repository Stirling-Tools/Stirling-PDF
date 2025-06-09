import React, { useState, useCallback, useEffect } from "react";
import { useTranslation } from 'react-i18next';
import { useSearchParams } from "react-router-dom";
import { useToolParams } from "../hooks/useToolParams";
import AddToPhotosIcon from "@mui/icons-material/AddToPhotos";
import ContentCutIcon from "@mui/icons-material/ContentCut";
import ZoomInMapIcon from "@mui/icons-material/ZoomInMap";
import { Group, Paper, Box, Button, useMantineTheme } from "@mantine/core";
import { useRainbowThemeContext } from "../components/RainbowThemeProvider";
import rainbowStyles from '../styles/rainbow.module.css';

import ToolPicker from "../components/ToolPicker";
import FileManager from "../components/FileManager";
import SplitPdfPanel from "../tools/Split";
import CompressPdfPanel from "../tools/Compress";
import MergePdfPanel from "../tools/Merge";
import PageEditor from "../components/PageEditor";
import Viewer from "../components/Viewer";
import TopControls from "../components/TopControls";
import ToolRenderer from "../components/ToolRenderer";

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
  split: { icon: <ContentCutIcon />, component: SplitPdfPanel, view: "viewer" },
  compress: { icon: <ZoomInMapIcon />, component: CompressPdfPanel, view: "viewer" },
  merge: { icon: <AddToPhotosIcon />, component: MergePdfPanel, view: "fileManager" },
};



export default function HomePage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const theme = useMantineTheme();
  const { isRainbowMode } = useRainbowThemeContext();

  // Core app state
  const [selectedToolKey, setSelectedToolKey] = useState<string>(searchParams.get("t") || "split");
  const [currentView, setCurrentView] = useState<string>(searchParams.get("v") || "viewer");
  const [pdfFile, setPdfFile] = useState<any>(null);
  const [files, setFiles] = useState<any[]>([]);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [sidebarsVisible, setSidebarsVisible] = useState(true);

  // URL parameter management
  const { toolParams, updateParams } = useToolParams(selectedToolKey, currentView);

  const toolRegistry: ToolRegistry = {
    split: { ...baseToolRegistry.split, name: t("home.split.title", "Split PDF") },
    compress: { ...baseToolRegistry.compress, name: t("home.compressPdfs.title", "Compress PDF") },
    merge: { ...baseToolRegistry.merge, name: t("home.merge.title", "Merge PDFs") },
  };


  // Handle tool selection
  const handleToolSelect = useCallback(
    (id: string) => {
      setSelectedToolKey(id);
      if (toolRegistry[id]?.view) setCurrentView(toolRegistry[id].view);
    },
    [toolRegistry]
  );

  const selectedTool = toolRegistry[selectedToolKey];

  return (
    <Group
      align="flex-start"
      gap={0}
      className="min-h-screen w-screen overflow-hidden flex-nowrap flex"
    >
      {/* Left: Tool Picker */}
      {sidebarsVisible && (
        <div
          className={`h-screen z-sticky flex flex-col bg-surface border-r border-border min-w-[180px] max-w-[240px] w-[16vw] ${isRainbowMode ? rainbowStyles.rainbowPaper : ''}`}
          style={{ padding: '1rem' }}
        >
          <ToolPicker
            selectedToolKey={selectedToolKey}
            onSelect={handleToolSelect}
            toolRegistry={toolRegistry}
          />
        </div>
      )}

      {/* Middle: Main View */}
      <Box className="flex-1 h-screen min-w-80 relative flex flex-col transition-all duration-300 bg-background">
        {/* Top Controls */}
        <TopControls
          currentView={currentView}
          setCurrentView={setCurrentView}
        />
        {/* Main content area */}
          <Box className="flex-1 min-h-0 margin-top-200 relative z-10">
            {(currentView === "viewer" || currentView === "pageEditor") && !pdfFile ? (
              <FileManager
                files={files}
                setFiles={setFiles}
                setPdfFile={setPdfFile}
                setCurrentView={setCurrentView}
              />
            ) : currentView === "viewer" ? (
              <Viewer
                pdfFile={pdfFile}
                setPdfFile={setPdfFile}
                sidebarsVisible={sidebarsVisible}
                setSidebarsVisible={setSidebarsVisible}
              />
            ) : currentView === "pageEditor" ? (
              <PageEditor
                file={pdfFile}
                setFile={setPdfFile}
                downloadUrl={downloadUrl}
                setDownloadUrl={setDownloadUrl}
              />
            ) : (
              <FileManager
                files={files}
                setFiles={setFiles}
                setPdfFile={setPdfFile}
                setCurrentView={setCurrentView}
              />
            )}
          </Box>
      </Box>

      {/* Right: Tool Interaction */}
      {sidebarsVisible && (
        <div
          className={`h-screen bg-surface border-l border-border gap-6 z-sticky flex flex-col min-w-[260px] max-w-[400px] w-[22vw] ${isRainbowMode ? rainbowStyles.rainbowPaper : ''}`}
          style={{ padding: '1.5rem' }}
        >
          <ToolRenderer
            selectedToolKey={selectedToolKey}
            selectedTool={selectedTool}
            pdfFile={pdfFile}
            files={files}
            downloadUrl={downloadUrl}
            setDownloadUrl={setDownloadUrl}
            toolParams={toolParams}
            updateParams={updateParams}
          />
        </div>
      )}
    </Group>
  );
}
