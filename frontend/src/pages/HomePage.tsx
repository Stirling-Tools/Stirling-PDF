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
import QuickAccessBar from "../components/QuickAccessBar";

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
  const [leftPanelView, setLeftPanelView] = useState<'toolPicker' | 'toolContent'>('toolPicker');
  const [readerMode, setReaderMode] = useState(false);

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
      setLeftPanelView('toolContent'); // Switch to tool content view when a tool is selected
      setReaderMode(false); // Exit reader mode when selecting a tool
    },
    [toolRegistry]
  );

  // Handle quick access actions
  const handleQuickAccessTools = useCallback(() => {
    setLeftPanelView('toolPicker');
    setReaderMode(false);
  }, []);


  const handleReaderToggle = useCallback(() => {
    setReaderMode(!readerMode);
  }, [readerMode]);

  const selectedTool = toolRegistry[selectedToolKey];

  return (
    <Group
      align="flex-start"
      gap={0}
      className="min-h-screen w-screen overflow-hidden flex-nowrap flex"
    >
      {/* Quick Access Bar */}
      <QuickAccessBar
        onToolsClick={handleQuickAccessTools}
        onReaderToggle={handleReaderToggle}
        selectedToolKey={selectedToolKey}
        toolRegistry={toolRegistry}
        leftPanelView={leftPanelView}
        readerMode={readerMode}
      />

      {/* Left: Tool Picker OR Selected Tool Panel */}
      {sidebarsVisible && !readerMode && (
        <div
          className={`h-screen z-sticky flex flex-col min-w-[300px] max-w-[450px] w-[25vw] ${isRainbowMode ? rainbowStyles.rainbowPaper : ''}`}
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderRight: '1px solid var(--border-subtle)',
            padding: '1rem'
          }}
        >
          {leftPanelView === 'toolPicker' ? (
            // Tool Picker View
            <div className="flex-1 flex flex-col">
              <ToolPicker
                selectedToolKey={selectedToolKey}
                onSelect={handleToolSelect}
                toolRegistry={toolRegistry}
              />
            </div>
          ) : (
            // Selected Tool Content View
            <div className="flex-1 flex flex-col">
              {/* Back button */}
              <div className="mb-4">
                <Button
                  variant="subtle"
                  size="sm"
                  onClick={() => setLeftPanelView('toolPicker')}
                  className="text-sm"
                >
                  ← Back to Tools
                </Button>
              </div>
              
              {/* Tool title */}
              <div className="mb-4">
                <h2 className="text-lg font-semibold">{selectedTool?.name}</h2>
              </div>
              
              {/* Tool content */}
              <div className="flex-1 min-h-0">
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
            </div>
          )}
        </div>
      )}

      {/* Main View */}
      <Box 
        className="flex-1 h-screen min-w-80 relative flex flex-col transition-all duration-300"
        style={{ backgroundColor: 'var(--bg-background)' }}
      >
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
    </Group>
  );
}
