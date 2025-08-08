import React, { useState, useCallback, useEffect } from "react";
import { useTranslation } from 'react-i18next';
import { useFileContext } from "../contexts/FileContext";
import { FileSelectionProvider, useFileSelection } from "../contexts/FileSelectionContext";
import { SidebarProvider, useSidebarContext } from "../contexts/SidebarContext";
import { useToolManagement } from "../hooks/useToolManagement";
import { useFileHandler } from "../hooks/useFileHandler";
import { Group, Box, Button } from "@mantine/core";
import { useRainbowThemeContext } from "../components/shared/RainbowThemeProvider";
import { PageEditorFunctions } from "../types/pageEditor";
import rainbowStyles from '../styles/rainbow.module.css';

import ToolPicker from "../components/tools/ToolPicker";
import ToolSearch from "../components/tools/toolPicker/ToolSearch";
import TopControls from "../components/shared/TopControls";
import FileEditor from "../components/fileEditor/FileEditor";
import PageEditor from "../components/pageEditor/PageEditor";
import PageEditorControls from "../components/pageEditor/PageEditorControls";
import Viewer from "../components/viewer/Viewer";
import ToolRenderer from "../components/tools/ToolRenderer";
import QuickAccessBar from "../components/shared/QuickAccessBar";
import LandingPage from "../components/shared/LandingPage";
import FileUploadModal from "../components/shared/FileUploadModal";


function HomePageContent() {
  const { t } = useTranslation();
  const { isRainbowMode } = useRainbowThemeContext();
  const { 
    sidebarState, 
    sidebarRefs, 
    setSidebarsVisible, 
    setLeftPanelView, 
    setReaderMode 
  } = useSidebarContext();
  
  const { sidebarsVisible, leftPanelView, readerMode } = sidebarState;
  const { quickAccessRef, toolPanelRef } = sidebarRefs;

  const fileContext = useFileContext();
  const { activeFiles, currentView, setCurrentView } = fileContext;
  const { setMaxFiles, setIsToolMode, setSelectedFiles } = useFileSelection();
  const { addToActiveFiles } = useFileHandler();

  const {
    selectedToolKey,
    selectedTool,
    toolRegistry,
    selectTool,
    clearToolSelection,
  } = useToolManagement();

  const [pageEditorFunctions, setPageEditorFunctions] = useState<PageEditorFunctions | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [toolSearch, setToolSearch] = useState("");

  // Update file selection context when tool changes
  useEffect(() => {
    if (selectedTool) {
      setMaxFiles(selectedTool.maxFiles);
      setIsToolMode(true);
    } else {
      setMaxFiles(-1);
      setIsToolMode(false);
      setSelectedFiles([]);
    }
  }, [selectedTool, setMaxFiles, setIsToolMode, setSelectedFiles]);



  const handleToolSelect = useCallback(
    (id: string) => {
      selectTool(id);
      setCurrentView('fileEditor'); // Tools use fileEditor view for file selection
      setLeftPanelView('toolContent');
      setReaderMode(false);
    },
    [selectTool, setCurrentView]
  );

  const handleQuickAccessTools = useCallback(() => {
    setLeftPanelView('toolPicker');
    setReaderMode(false);
    clearToolSelection();
  }, [clearToolSelection]);

  const handleReaderToggle = useCallback(() => {
    setReaderMode(true);
  }, [readerMode]);

  const handleViewChange = useCallback((view: string) => {
    setCurrentView(view as any);
  }, [setCurrentView]);

  const handleToolSearchSelect = useCallback((toolId: string) => {
    selectTool(toolId);
    setCurrentView('fileEditor');
    setLeftPanelView('toolContent');
    setReaderMode(false);
    setToolSearch(''); // Clear search after selection
  }, [selectTool, setCurrentView]);


  return (
    <Group
      align="flex-start"
      gap={0}
      className="min-h-screen w-screen overflow-hidden flex-nowrap flex"
    >
      {/* Quick Access Bar */}
      <QuickAccessBar
        ref={quickAccessRef}
        onToolsClick={handleQuickAccessTools}
        onReaderToggle={handleReaderToggle}
      />

      {/* Left: Tool Picker or Selected Tool Panel */}
      <div
        ref={toolPanelRef}
        data-sidebar="tool-panel"
        className={`h-screen flex flex-col overflow-hidden bg-[var(--bg-toolbar)] border-r border-[var(--border-subtle)] transition-all duration-300 ease-out ${isRainbowMode ? rainbowStyles.rainbowPaper : ''}`}
        style={{
          width: sidebarsVisible && !readerMode ? '280px' : '0',
          backgroundColor: 'var(--bg-toolbar)'
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
                {/* Search bar for quick tool switching */}
                <div className="mb-4 border-b-1 border-b-[var(--border-default)] mb-4" >
                  <ToolSearch
                    value={toolSearch}
                    onChange={setToolSearch}
                    toolRegistry={toolRegistry}
                    onToolSelect={handleToolSearchSelect}
                    mode="dropdown"
                    selectedToolKey={selectedToolKey}
                  />
                </div>

                {/* Back button */}
                <div className="mb-4" style={{ padding: '0 1rem', marginTop: '1rem'}}>
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
                <div className="mb-4" style={{ marginLeft: '1rem' }}>
                  <h2 className="text-lg font-semibold">{selectedTool?.name}</h2>
                </div>

                {/* Tool content */}
                <div className="flex-1 min-h-0" style={{ padding: '0 1rem' }}>
                  <ToolRenderer
                    selectedToolKey={selectedToolKey}
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
        style={
          isRainbowMode
            ? {} // No background color in rainbow mode
            : { backgroundColor: 'var(--bg-background)' }
        }
      >
        {/* Top Controls */}
        <TopControls
          currentView={currentView}
          setCurrentView={handleViewChange}
          selectedToolKey={selectedToolKey}
        />
        {/* Main content area */}
          <Box
            className="flex-1 min-h-0 relative z-10"
            style={{
              transition: 'opacity 0.15s ease-in-out',
            }}
          >
            {!activeFiles[0] ? (
              <LandingPage
                title={currentView === "viewer"
                  ? t("fileUpload.selectPdfToView", "Select a PDF to view")
                  : t("fileUpload.selectPdfToEdit", "Select a PDF to edit")
                }
              />
            ) : currentView === "fileEditor" ? (
              <FileEditor
                toolMode={!!selectedToolKey}
                showUpload={true}
                showBulkActions={!selectedToolKey}
                supportedExtensions={selectedTool?.supportedFormats || ["pdf"]}
                {...(!selectedToolKey && {
                  onOpenPageEditor: (file) => {
                    handleViewChange("pageEditor");
                  },
                  onMergeFiles: (filesToMerge) => {
                    filesToMerge.forEach(addToActiveFiles);
                    handleViewChange("viewer");
                  }
                })}
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
                    } else if (previousMode === 'compress') {
                      selectTool('compress');
                      setCurrentView('compress');
                      setLeftPanelView('toolContent');
                      sessionStorage.removeItem('previousMode');
                    } else if (previousMode === 'convert') {
                      selectTool('convert');
                      setCurrentView('convert');
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
            ) : selectedToolKey && selectedTool ? (
              // Fallback: if tool is selected but not in fileEditor view, show tool in main area
              <ToolRenderer
                selectedToolKey={selectedToolKey}
              />
            ) : (
              <LandingPage 
                title="File Management" 
              />
            )}
          </Box>
      </Box>

      {/* Global Modals */}
      <FileUploadModal selectedTool={selectedTool} />
    </Group>
  );
}

// Main HomePage component wrapped with FileSelectionProvider
export default function HomePage() {
  return (
    <FileSelectionProvider>
      <SidebarProvider>
        <HomePageContent />
      </SidebarProvider>
    </FileSelectionProvider>
  );
}
