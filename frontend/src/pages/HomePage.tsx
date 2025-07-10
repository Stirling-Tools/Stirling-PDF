import React, { useState, useCallback, useEffect } from "react";
import { useTranslation } from 'react-i18next';
import { useFileWithUrl } from "../hooks/useFileWithUrl";
import { useFileContext } from "../contexts/FileContext";
import { fileStorage } from "../services/fileStorage";
import AddToPhotosIcon from "@mui/icons-material/AddToPhotos";
import ContentCutIcon from "@mui/icons-material/ContentCut";
import ZoomInMapIcon from "@mui/icons-material/ZoomInMap";
import { Group, Paper, Box, Button, useMantineTheme, Container } from "@mantine/core";
import { useRainbowThemeContext } from "../components/shared/RainbowThemeProvider";
import rainbowStyles from '../styles/rainbow.module.css';

import ToolPicker from "../components/tools/ToolPicker";
import TopControls from "../components/shared/TopControls";
import FileEditor from "../components/fileEditor/FileEditor";
import PageEditor from "../components/pageEditor/PageEditor";
import PageEditorControls from "../components/pageEditor/PageEditorControls";
import Viewer from "../components/viewer/Viewer";
import FileUploadSelector from "../components/shared/FileUploadSelector";
import SplitPdfPanel from "../tools/Split";
import CompressPdfPanel from "../tools/Compress";
import MergePdfPanel from "../tools/Merge";
import ToolRenderer from "../components/tools/ToolRenderer";
import QuickAccessBar from "../components/shared/QuickAccessBar";

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

export default function HomePage() {
  const { t } = useTranslation();
  const theme = useMantineTheme();
  const { isRainbowMode } = useRainbowThemeContext();
  
  // Get file context
  const fileContext = useFileContext();
  const { activeFiles, currentView, currentMode, setCurrentView, addFiles } = fileContext;

  // Core app state
  const [selectedToolKey, setSelectedToolKey] = useState<string | null>(null);

  const [storedFiles, setStoredFiles] = useState<any[]>([]);
  const [preSelectedFiles, setPreSelectedFiles] = useState([]);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [sidebarsVisible, setSidebarsVisible] = useState(true);
  const [leftPanelView, setLeftPanelView] = useState<'toolPicker' | 'toolContent'>('toolPicker');
  const [readerMode, setReaderMode] = useState(false);
  const [pageEditorFunctions, setPageEditorFunctions] = useState<any>(null);
  const [toolSelectedFiles, setToolSelectedFiles] = useState<File[]>([]);
  const [toolParams, setToolParams] = useState<Record<string, any>>({});

  // Tool registry
  const toolRegistry: ToolRegistry = {
    split: { ...baseToolRegistry.split, name: t("home.split.title", "Split PDF") },
    compress: { ...baseToolRegistry.compress, name: t("home.compressPdfs.title", "Compress PDF") },
    merge: { ...baseToolRegistry.merge, name: t("home.merge.title", "Merge PDFs") },
  };

  // Tool parameters with state management
  const getToolParams = (toolKey: string | null) => {
    if (!toolKey) return {};
    
    // Get stored params for this tool, or use defaults
    const storedParams = toolParams[toolKey] || {};
    
    const defaultParams = (() => {
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
    })();
    
    return { ...defaultParams, ...storedParams };
  };

  const updateToolParams = useCallback((toolKey: string, newParams: any) => {
    setToolParams(prev => ({
      ...prev,
      [toolKey]: {
        ...prev[toolKey],
        ...newParams
      }
    }));
  }, []);


  useEffect(() => {
    const activeFileData = activeFiles.map(file => ({
      name: file.name,
      size: file.size,
      type: file.type,
      lastModified: file.lastModified
    }));
    localStorage.setItem('activeFiles', JSON.stringify(activeFileData));
  }, [activeFiles]);

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

  useEffect(() => {
    const restoreActiveFiles = async () => {
      try {
        const savedFileData = JSON.parse(localStorage.getItem('activeFiles') || '[]');
        if (savedFileData.length > 0) {
          // File restoration handled by FileContext
        }
      } catch (error) {
        console.warn('Failed to restore active files:', error);
      }
    };
    restoreActiveFiles();
  }, []);

  const handleToolSelect = useCallback(
    (id: string) => {
      setSelectedToolKey(id);
      if (toolRegistry[id]?.view) setCurrentView(toolRegistry[id].view);
      setLeftPanelView('toolContent');
      setReaderMode(false);
    },
    [toolRegistry, setCurrentView]
  );

  const handleQuickAccessTools = useCallback(() => {
    setLeftPanelView('toolPicker');
    setReaderMode(false);
    setSelectedToolKey(null);
  }, []);

  const handleReaderToggle = useCallback(() => {
    setReaderMode(!readerMode);
  }, [readerMode]);

  const handleViewChange = useCallback((view: string) => {
    setCurrentView(view as any);
  }, [setCurrentView]);
  const addToActiveFiles = useCallback(async (file: File) => {
    const exists = activeFiles.some(f => f.name === file.name && f.size === file.size);
    if (!exists) {
      await addFiles([file]);
    }
  }, [activeFiles, addFiles]);

  const removeFromActiveFiles = useCallback((file: File) => {
    fileContext.removeFiles([file.name]);
  }, [fileContext]);

  const setCurrentActiveFile = useCallback(async (file: File) => {
    const filtered = activeFiles.filter(f => !(f.name === file.name && f.size === file.size));
    await addFiles([file, ...filtered]);
  }, [activeFiles, addFiles]);

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
      await addFiles(validFiles);
      setPreSelectedFiles([]); // Clear preselected since we're using activeFiles now
      handleViewChange("fileEditor");
    } catch (error) {
      console.error('Error converting selected files:', error);
    }
  }, [handleViewChange, addFiles]);

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
      await addFiles(validFiles);
      handleViewChange("pageEditor");
    } catch (error) {
      console.error('Error converting selected files for page editor:', error);
    }
  }, [handleViewChange, addFiles]);

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
                    onClick={handleQuickAccessTools}
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
                    toolParams={getToolParams(selectedToolKey)}
                    updateParams={(newParams) => updateToolParams(selectedToolKey, newParams)}
                    toolSelectedFiles={toolSelectedFiles}
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
          selectedToolKey={selectedToolKey}
        />
        {/* Main content area */}
          <Box 
            className="flex-1 min-h-0 margin-top-200 relative z-10"
            style={{
              transition: 'opacity 0.15s ease-in-out',
            }}
          >
            {!activeFiles[0] ? (
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
                  onFilesSelect={(files) => {
                    files.forEach(addToActiveFiles);
                  }}
                  accept={["application/pdf"]}
                  loading={false}
                  showRecentFiles={true}
                  maxRecentFiles={8}
                />
              </Container>
            ) : currentView === "fileEditor" ? (
              <FileEditor
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
                    fileContext.clearAllFiles();
                  }
                }}
                sidebarsVisible={sidebarsVisible}
                setSidebarsVisible={setSidebarsVisible}
              />
            ) : currentView === "pageEditor" ? (
              <>
                <PageEditor
                  onFunctionsReady={setPageEditorFunctions}
                />
                {pageEditorFunctions && (
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
            ) : currentView === "split" ? (
              <FileEditor
                toolMode={true}
                multiSelect={false}
                showUpload={true}
                showBulkActions={true}
                onFileSelect={(files) => {
                  setToolSelectedFiles(files);
                }}
              />
            ) : selectedToolKey && selectedTool ? (
              <ToolRenderer
                selectedToolKey={selectedToolKey}
                selectedTool={selectedTool}
                pdfFile={activeFiles[0] || null}
                files={activeFiles}
                downloadUrl={downloadUrl}
                setDownloadUrl={setDownloadUrl}
                toolParams={getToolParams(selectedToolKey)}
                updateParams={() => {}}
              />
            ) : (
              <Container size="lg" p="xl" h="100%" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FileUploadSelector
                  title="File Management"
                  subtitle="Choose files from storage or upload new PDFs"
                  sharedFiles={storedFiles}
                  onFileSelect={(file) => {
                    addToActiveFiles(file);
                  }}
                  onFilesSelect={(files) => {
                    files.forEach(addToActiveFiles);
                  }}
                  accept={["application/pdf"]}
                  loading={false}
                  showRecentFiles={true}
                  maxRecentFiles={8}
                />
              </Container>
            )}
          </Box>
      </Box>
    </Group>
  );
}
