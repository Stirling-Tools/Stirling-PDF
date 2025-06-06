import React, { useState, useCallback, useEffect } from "react";
import { useTranslation } from 'react-i18next';
import { useSearchParams } from "react-router-dom";
import { useToolParams } from "../hooks/useToolParams";
import AddToPhotosIcon from "@mui/icons-material/AddToPhotos";
import ContentCutIcon from "@mui/icons-material/ContentCut";
import ZoomInMapIcon from "@mui/icons-material/ZoomInMap";
import { Group, Paper, Box, Button, useMantineTheme, useMantineColorScheme } from "@mantine/core";

import ToolPicker from "../components/ToolPicker";
import FileManager from "../components/FileManager";
import SplitPdfPanel from "../tools/Split";
import CompressPdfPanel from "../tools/Compress";
import MergePdfPanel from "../tools/Merge";
import PageEditor from "../components/PageEditor";
import Viewer from "../components/Viewer";
import TopControls from "../components/TopControls";
import ToolRenderer from "../components/ToolRenderer";
import styles from "../styles/HomePage.module.css";

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
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();

  // Core app state
  const [selectedToolKey, setSelectedToolKey] = useState<string>(searchParams.get("t") || "split");
  const [currentView, setCurrentView] = useState<string>(searchParams.get("v") || "viewer");
  const [pdfFile, setPdfFile] = useState<any>(null);
  const [files, setFiles] = useState<any[]>([]);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [sidebarsVisible, setSidebarsVisible] = useState(true);

  // URL parameter management
  const { toolParams, updateParams } = useToolParams(selectedToolKey, currentView);

  // Create translated tool registry
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
        <Box
          className={`${styles.leftSidebar} h-screen z-sticky flex flex-col bg-bg-surface border-r border-border-subtle`}
        >
          <ToolPicker
            selectedToolKey={selectedToolKey}
            onSelect={handleToolSelect}
            toolRegistry={toolRegistry}
          />
        </Box>
      )}

      {/* Middle: Main View */}
      <Box className="flex-1 h-screen min-w-80 relative flex flex-col transition-all duration-300 bg-bg-app">
        {/* Top Controls */}
        <TopControls
          currentView={currentView}
          setCurrentView={setCurrentView}
        />
        {/* Main content area */}
        <Paper
          radius="0 0 xl xl"
          shadow="sm"
          p={0}
          className="flex-1 min-h-0 mt-0 box-border overflow-hidden flex flex-col"
        >
          <Box className="flex-1 min-h-0">
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
        </Paper>
      </Box>

      {/* Right: Tool Interaction */}
      {sidebarsVisible && (
        <Box
          className={`${styles.rightSidebar} h-screen bg-bg-surface border-l border-border-subtle p-app-lg gap-app-md z-sticky flex flex-col`}
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
        </Box>
      )}

      {/* Sidebar toggle button */}
      <Button
        variant="light"
        color="blue"
        size="xs"
        className="fixed top-app-md right-app-md z-fixed"
        onClick={() => setSidebarsVisible((v) => !v)}
      >
        {t("sidebar.toggle", sidebarsVisible ? "Hide Sidebars" : "Show Sidebars")}
      </Button>
    </Group>
  );
}
