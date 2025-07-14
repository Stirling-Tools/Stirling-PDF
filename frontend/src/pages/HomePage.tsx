import React, { useState, useCallback} from "react";
import { useTranslation } from 'react-i18next';
import { useFileContext } from "../contexts/FileContext";
import { useToolManagement } from "../hooks/useToolManagement";
import { Group, Box, Button, Container } from "@mantine/core";
import { useRainbowThemeContext } from "../components/shared/RainbowThemeProvider";
import rainbowStyles from '../styles/rainbow.module.css';

import ToolPicker from "../components/tools/ToolPicker";
import TopControls from "../components/shared/TopControls";
import FileEditor from "../components/fileEditor/FileEditor";
import PageEditor from "../components/pageEditor/PageEditor";
import PageEditorControls from "../components/pageEditor/PageEditorControls";
import Viewer from "../components/viewer/Viewer";
import FileUploadSelector from "../components/shared/FileUploadSelector";
import ToolRenderer from "../components/tools/ToolRenderer";
import QuickAccessBar from "../components/shared/QuickAccessBar";
import { useMultipleEndpointsEnabled } from "../hooks/useEndpointConfig";

export default function HomePage() {
  const { t } = useTranslation();
  const { isRainbowMode } = useRainbowThemeContext();

  // Get file context
  const fileContext = useFileContext();
  const { activeFiles, currentView, currentMode, setCurrentView, addFiles } = fileContext;

  const {
    selectedToolKey,
    selectedTool,
    toolParams,
    toolRegistry,
    selectTool,
    clearToolSelection,
    updateToolParams,
  } = useToolManagement();

  const [toolSelectedFiles, setToolSelectedFiles] = useState<File[]>([]);
  const [sidebarsVisible, setSidebarsVisible] = useState(true);
  const [leftPanelView, setLeftPanelView] = useState<'toolPicker' | 'toolContent'>('toolPicker');
  const [readerMode, setReaderMode] = useState(false);
  const [pageEditorFunctions, setPageEditorFunctions] = useState<any>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);





  const handleToolSelect = useCallback(
    (id: string) => {
      selectTool(id);
      if (toolRegistry[id]?.view) setCurrentView(toolRegistry[id].view);
      setLeftPanelView('toolContent');
      setReaderMode(false);
    },
    [selectTool, toolRegistry, setCurrentView]
  );

  const handleQuickAccessTools = useCallback(() => {
    setLeftPanelView('toolPicker');
    setReaderMode(false);
    clearToolSelection();
  }, [clearToolSelection]);

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

      {/* Left: Tool Picker or Selected Tool Panel */}
      <div
        className={`h-screen flex flex-col overflow-hidden bg-[var(--bg-surface)] border-r border-[var(--border-subtle)] transition-all duration-300 ease-out ${isRainbowMode ? rainbowStyles.rainbowPaper : ''}`}
        style={{
          width: sidebarsVisible && !readerMode ? '14vw' : '0',
          padding: sidebarsVisible && !readerMode ? '1rem' : '0'
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
                    toolSelectedFiles={toolSelectedFiles}
                    onPreviewFile={setPreviewFile}
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
                sidebarsVisible={sidebarsVisible}
                setSidebarsVisible={setSidebarsVisible}
                previewFile={previewFile}
                {...(previewFile && {
                  onClose: () => {
                    setPreviewFile(null); // Clear preview file
                    const previousMode = sessionStorage.getItem('previousMode');
                    if (previousMode === 'split') {
                      selectTool('split');
                      setCurrentView('split');
                      setLeftPanelView('toolContent');
                      sessionStorage.removeItem('previousMode');
                    } else {
                      setCurrentView('fileEditor');
                    }
                  }
                })}
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
              />
            ) : (
              <Container size="lg" p="xl" h="100%" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FileUploadSelector
                  title="File Management"
                  subtitle="Choose files from storage or upload new PDFs"
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
