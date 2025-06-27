import React, { useState, useCallback, useEffect } from "react";
import { useTranslation } from 'react-i18next';
import { useSearchParams } from "react-router-dom";
import { useToolParams } from "../hooks/useToolParams";
import { useFileWithUrl } from "../hooks/useFileWithUrl";
import { fileStorage } from "../services/fileStorage";
import AddToPhotosIcon from "@mui/icons-material/AddToPhotos";
import ContentCutIcon from "@mui/icons-material/ContentCut";
import ZoomInMapIcon from "@mui/icons-material/ZoomInMap";
import { Group, Paper, Box, Button, useMantineTheme, Container } from "@mantine/core";
import { useRainbowThemeContext } from "../components/shared/RainbowThemeProvider";
import rainbowStyles from '../styles/rainbow.module.css';

import ToolPicker from "../components/tools/ToolPicker";
import TopControls from "../components/shared/TopControls";
import FileManager from "../components/fileManagement/FileManager";
import FileEditor from "../components/pageEditor/FileEditor";
import PageEditor from "../components/pageEditor/PageEditor";
import PageEditorControls from "../components/pageEditor/PageEditorControls";
import Viewer from "../components/viewer/Viewer";
import FileUploadSelector from "../components/shared/FileUploadSelector";
import SplitPdfPanel from "../tools/Split";
import CompressPdfPanel from "../tools/Compress";
import MergePdfPanel from "../tools/Merge";
import ToolRenderer from "../components/tools/ToolRenderer";
import QuickAccessBar from "../components/shared/QuickAccessBar";
import { useMultipleEndpointsEnabled } from "../hooks/useEndpointConfig";

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

// Tool endpoint mappings
const toolEndpoints: Record<string, string[]> = {
  split: ["split-pages", "split-pdf-by-sections", "split-by-size-or-count", "split-pdf-by-chapters"],
  compress: ["compress-pdf"],
  merge: ["merge-pdfs"],
};

export default function HomePage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const theme = useMantineTheme();
  const { isRainbowMode } = useRainbowThemeContext();

  // Core app state
  const [selectedToolKey, setSelectedToolKey] = useState<string>(searchParams.get("t") || "split");
  const [currentView, setCurrentView] = useState<string>(searchParams.get("v") || "viewer");

  // File state separation
  const [storedFiles, setStoredFiles] = useState<any[]>([]); // IndexedDB files (FileManager)
  const [activeFiles, setActiveFiles] = useState<File[]>([]); // Active working set (persisted)
  const [preSelectedFiles, setPreSelectedFiles] = useState([]);

  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [sidebarsVisible, setSidebarsVisible] = useState(true);
  const [leftPanelView, setLeftPanelView] = useState<'toolPicker' | 'toolContent'>('toolPicker');
  const [readerMode, setReaderMode] = useState(false);

  // Page editor functions
  const [pageEditorFunctions, setPageEditorFunctions] = useState<any>(null);

  // URL parameter management
  const { toolParams, updateParams } = useToolParams(selectedToolKey, currentView);

  // Get all unique endpoints for batch checking
  const allEndpoints = Array.from(new Set(Object.values(toolEndpoints).flat()));
  const { endpointStatus, loading: endpointsLoading } = useMultipleEndpointsEnabled(allEndpoints);

  // Persist active files across reloads
  useEffect(() => {
    // Save active files to localStorage (just metadata)
    const activeFileData = activeFiles.map(file => ({
      name: file.name,
      size: file.size,
      type: file.type,
      lastModified: file.lastModified
    }));
    localStorage.setItem('activeFiles', JSON.stringify(activeFileData));
  }, [activeFiles]);

  // Load stored files from IndexedDB on mount
  useEffect(() => {
    const loadStoredFiles = async () => {
      try {
        const files = await fileStorage.getAllFiles();
        setStoredFiles(files);
      } catch (error) {
        console.warn('Failed to load stored files:', error);
      }
    };
    loadStoredFiles();
  }, []);

  // Restore active files on load
  useEffect(() => {
    const restoreActiveFiles = async () => {
      try {
        const savedFileData = JSON.parse(localStorage.getItem('activeFiles') || '[]');
        if (savedFileData.length > 0) {
          // TODO: Reconstruct files from IndexedDB when fileStorage is available
          console.log('Would restore active files:', savedFileData);
        }
      } catch (error) {
        console.warn('Failed to restore active files:', error);
      }
    };
    restoreActiveFiles();
  }, []);

  // Helper function to check if a tool is available
  const isToolAvailable = (toolKey: string): boolean => {
    if (endpointsLoading) return true; // Show tools while loading
    const endpoints = toolEndpoints[toolKey] || [];
    // Tool is available if at least one of its endpoints is enabled
    return endpoints.some(endpoint => endpointStatus[endpoint] === true);
  };

  // Filter tool registry to only show available tools
  const availableToolRegistry: ToolRegistry = {};
  Object.keys(baseToolRegistry).forEach(toolKey => {
    if (isToolAvailable(toolKey)) {
      availableToolRegistry[toolKey] = {
        ...baseToolRegistry[toolKey as keyof typeof baseToolRegistry],
        name: t(`home.${toolKey}.title`, toolKey.charAt(0).toUpperCase() + toolKey.slice(1))
      };
    }
  });

  const toolRegistry = availableToolRegistry;

  // Handle case where selected tool becomes unavailable
  useEffect(() => {
    if (!endpointsLoading && selectedToolKey && !toolRegistry[selectedToolKey]) {
      // If current tool is not available, select the first available tool
      const firstAvailableTool = Object.keys(toolRegistry)[0];
      if (firstAvailableTool) {
        setSelectedToolKey(firstAvailableTool);
        if (toolRegistry[firstAvailableTool]?.view) {
          setCurrentView(toolRegistry[firstAvailableTool].view);
        }
      }
    }
  }, [endpointsLoading, selectedToolKey, toolRegistry]);

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

  // Update URL when view changes
  const handleViewChange = useCallback((view: string) => {
    setCurrentView(view);
    const params = new URLSearchParams(window.location.search);
    params.set('view', view);
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, '', newUrl);
  }, []);

  // Active file management
  const addToActiveFiles = useCallback((file: File) => {
    setActiveFiles(prev => {
      // Avoid duplicates based on name and size
      const exists = prev.some(f => f.name === file.name && f.size === file.size);
      if (exists) return prev;
      return [file, ...prev];
    });
  }, []);

  const removeFromActiveFiles = useCallback((file: File) => {
    setActiveFiles(prev => prev.filter(f => !(f.name === file.name && f.size === file.size)));
  }, []);

  const setCurrentActiveFile = useCallback((file: File) => {
    setActiveFiles(prev => {
      const filtered = prev.filter(f => !(f.name === file.name && f.size === file.size));
      return [file, ...filtered];
    });
  }, []);

  // Handle file selection from upload (adds to active files)
  const handleFileSelect = useCallback((file: File) => {
    addToActiveFiles(file);
  }, [addToActiveFiles]);

  // Handle opening file editor with selected files
  const handleOpenFileEditor = useCallback(async (selectedFiles) => {
    if (!selectedFiles || selectedFiles.length === 0) {
      setPreSelectedFiles([]);
      handleViewChange("fileEditor");
      return;
    }

    // Convert FileWithUrl[] to File[] and add to activeFiles
    try {
      const convertedFiles = await Promise.all(
        selectedFiles.map(async (fileItem) => {
          // If it's already a File, return as is
          if (fileItem instanceof File) {
            return fileItem;
          }

          // If it has a file property, use that
          if (fileItem.file && fileItem.file instanceof File) {
            return fileItem.file;
          }

          // If it's from IndexedDB storage, reconstruct the File
          if (fileItem.arrayBuffer && typeof fileItem.arrayBuffer === 'function') {
            const arrayBuffer = await fileItem.arrayBuffer();
            const blob = new Blob([arrayBuffer], { type: fileItem.type || 'application/pdf' });
            const file = new File([blob], fileItem.name, {
              type: fileItem.type || 'application/pdf',
              lastModified: fileItem.lastModified || Date.now()
            });
            // Mark as from storage to avoid re-storing
            (file as any).storedInIndexedDB = true;
            return file;
          }

          console.warn('Could not convert file item:', fileItem);
          return null;
        })
      );

      // Filter out nulls and add to activeFiles
      const validFiles = convertedFiles.filter((f): f is File => f !== null);
      setActiveFiles(validFiles);
      setPreSelectedFiles([]); // Clear preselected since we're using activeFiles now
      handleViewChange("fileEditor");
    } catch (error) {
      console.error('Error converting selected files:', error);
    }
  }, [handleViewChange, setActiveFiles]);

  // Handle opening page editor with selected files
  const handleOpenPageEditor = useCallback(async (selectedFiles) => {
    if (!selectedFiles || selectedFiles.length === 0) {
      handleViewChange("pageEditor");
      return;
    }

    // Convert FileWithUrl[] to File[] and add to activeFiles
    try {
      const convertedFiles = await Promise.all(
        selectedFiles.map(async (fileItem) => {
          // If it's already a File, return as is
          if (fileItem instanceof File) {
            return fileItem;
          }

          // If it has a file property, use that
          if (fileItem.file && fileItem.file instanceof File) {
            return fileItem.file;
          }

          // If it's from IndexedDB storage, reconstruct the File
          if (fileItem.arrayBuffer && typeof fileItem.arrayBuffer === 'function') {
            const arrayBuffer = await fileItem.arrayBuffer();
            const blob = new Blob([arrayBuffer], { type: fileItem.type || 'application/pdf' });
            const file = new File([blob], fileItem.name, {
              type: fileItem.type || 'application/pdf',
              lastModified: fileItem.lastModified || Date.now()
            });
            // Mark as from storage to avoid re-storing
            (file as any).storedInIndexedDB = true;
            return file;
          }

          console.warn('Could not convert file item:', fileItem);
          return null;
        })
      );

      // Filter out nulls and add to activeFiles
      const validFiles = convertedFiles.filter((f): f is File => f !== null);
      setActiveFiles(validFiles);
      handleViewChange("pageEditor");
    } catch (error) {
      console.error('Error converting selected files for page editor:', error);
    }
  }, [handleViewChange, setActiveFiles]);

  const selectedTool = toolRegistry[selectedToolKey];

  // For Viewer - convert first active file to expected format (only when needed)
  const currentFileWithUrl = useFileWithUrl(
    (currentView === "viewer" && activeFiles[0]) ? activeFiles[0] : null
  );

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
      <div
        className={`h-screen z-sticky flex flex-col ${isRainbowMode ? rainbowStyles.rainbowPaper : ''} overflow-hidden`}
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderRight: '1px solid var(--border-subtle)',
          width: sidebarsVisible && !readerMode ? '25vw' : '0px',
          minWidth: sidebarsVisible && !readerMode ? '300px' : '0px',
          maxWidth: sidebarsVisible && !readerMode ? '450px' : '0px',
          transition: 'width 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94), min-width 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94), max-width 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
          padding: sidebarsVisible && !readerMode ? '1rem' : '0rem'
        }}
      >
          <div
            style={{
              opacity: sidebarsVisible && !readerMode ? 1 : 0,
              transition: 'opacity 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
              height: '100%',
              display: 'flex',
              flexDirection: 'column'
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
                    ← {t("fileUpload.backToTools", "Back to Tools")}
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
                    pdfFile={activeFiles[0] || null}
                    files={activeFiles}
                    downloadUrl={downloadUrl}
                    setDownloadUrl={setDownloadUrl}
                    toolParams={toolParams}
                    updateParams={updateParams}
                  />
                </div>
              </div>
            )}
          </div>
      </div>

      {/* Main View */}
      <Box
        className="flex-1 h-screen min-w-80 relative flex flex-col"
        style={{
          backgroundColor: 'var(--bg-background)'
        }}
      >
        {/* Top Controls */}
        <TopControls
          currentView={currentView}
          setCurrentView={handleViewChange}
        />
        {/* Main content area */}
          <Box className="flex-1 min-h-0 margin-top-200 relative z-10">
            {currentView === "fileManager" ? (
              <FileManager
                files={storedFiles}
                setFiles={setStoredFiles}
                setCurrentView={handleViewChange}
                onOpenFileEditor={handleOpenFileEditor}
                onOpenPageEditor={handleOpenPageEditor}
                onLoadFileToActive={addToActiveFiles}
              />
            ) : (currentView != "fileManager") && !activeFiles[0] ? (
              <Container size="lg" p="xl" h="100%" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FileUploadSelector
                  title={currentView === "viewer"
                    ? t("fileUpload.selectPdfToView", "Select a PDF to view")
                    : t("fileUpload.selectPdfToEdit", "Select a PDF to edit")
                  }
                  subtitle={t("fileUpload.chooseFromStorage", "Choose a file from storage or upload a new PDF")}
                  sharedFiles={storedFiles}
                  onFileSelect={(file) => {
                    addToActiveFiles(file);
                  }}
                  allowMultiple={false}
                  accept={["application/pdf"]}
                  loading={false}
                />
              </Container>
            ) : currentView === "fileEditor" ? (
              <FileEditor
                activeFiles={activeFiles}
                setActiveFiles={setActiveFiles}
                preSelectedFiles={preSelectedFiles}
                onClearPreSelection={() => setPreSelectedFiles([])}
                onOpenPageEditor={(file) => {
                  setCurrentActiveFile(file);
                  handleViewChange("pageEditor");
                }}
                onMergeFiles={(filesToMerge) => {
                  // Add merged files to active set
                  filesToMerge.forEach(addToActiveFiles);
                  handleViewChange("viewer");
                }}
              />
            ) :  currentView === "viewer" ? (
              <Viewer
                pdfFile={currentFileWithUrl}
                setPdfFile={(fileObj) => {
                  if (fileObj) {
                    setCurrentActiveFile(fileObj.file);
                  } else {
                    setActiveFiles([]);
                  }
                }}
                sidebarsVisible={sidebarsVisible}
                setSidebarsVisible={setSidebarsVisible}
              />
            ) : currentView === "pageEditor" ? (
              <>
                <PageEditor
                  activeFiles={activeFiles}
                  setActiveFiles={setActiveFiles}
                  downloadUrl={downloadUrl}
                  setDownloadUrl={setDownloadUrl}
                  sharedFiles={storedFiles}
                  onFunctionsReady={setPageEditorFunctions}
                />
                {activeFiles[0] && pageEditorFunctions && (
                  <PageEditorControls
                    onClosePdf={pageEditorFunctions.closePdf}
                    onUndo={pageEditorFunctions.handleUndo}
                    onRedo={pageEditorFunctions.handleRedo}
                    canUndo={pageEditorFunctions.canUndo}
                    canRedo={pageEditorFunctions.canRedo}
                    onRotate={pageEditorFunctions.handleRotate}
                    onDelete={pageEditorFunctions.handleDelete}
                    onSplit={pageEditorFunctions.handleSplit}
                    onExportSelected={pageEditorFunctions.onExportSelected}
                    onExportAll={pageEditorFunctions.onExportAll}
                    exportLoading={pageEditorFunctions.exportLoading}
                    selectionMode={pageEditorFunctions.selectionMode}
                    selectedPages={pageEditorFunctions.selectedPages}
                  />
                )}
              </>
            ) : (
              <FileManager
                files={storedFiles}
                setFiles={setStoredFiles}
                setCurrentView={handleViewChange}
                onOpenFileEditor={handleOpenFileEditor}
                onOpenPageEditor={handleOpenPageEditor}
                onLoadFileToActive={addToActiveFiles}
              />
            )}
          </Box>
      </Box>
    </Group>
  );
}
