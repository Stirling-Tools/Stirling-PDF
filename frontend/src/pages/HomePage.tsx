import React, { useState, useCallback, useEffect, useRef } from "react";
import { useTranslation } from 'react-i18next';
import { useFileContext } from "../contexts/FileContext";
import { FileSelectionProvider, useFileSelection } from "../contexts/FileSelectionContext";
import { useToolManagement } from "../hooks/useToolManagement";
import { useFileHandler } from "../hooks/useFileHandler";
import { Group } from "@mantine/core";
import { PageEditorFunctions } from "../types/pageEditor";

import ToolPanel from "../components/tools/ToolPanel";
import Workbench from "../components/layout/Workbench";
import QuickAccessBar from "../components/shared/QuickAccessBar";
import FileUploadModal from "../components/shared/FileUploadModal";

function HomePageContent() {
  const { t } = useTranslation();

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

  const [sidebarsVisible, setSidebarsVisible] = useState(true);
  const [leftPanelView, setLeftPanelView] = useState<'toolPicker' | 'toolContent'>('toolPicker');
  const [readerMode, setReaderMode] = useState(false);
  const [pageEditorFunctions, setPageEditorFunctions] = useState<PageEditorFunctions | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);

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

  return (
    <Group
      align="flex-start"
      gap={0}
      className="min-h-screen w-screen overflow-hidden flex-nowrap flex"
    >
      <QuickAccessBar
        onToolsClick={handleQuickAccessTools}
        onReaderToggle={handleReaderToggle}
        selectedToolKey={selectedToolKey}
        toolRegistry={toolRegistry}
        leftPanelView={leftPanelView}
        readerMode={readerMode}
      />

      <ToolPanel
        visible={sidebarsVisible}
        readerMode={readerMode}
        leftPanelView={leftPanelView}
        selectedToolKey={selectedToolKey}
        selectedTool={selectedTool}
        toolRegistry={toolRegistry}
        onToolSelect={handleToolSelect}
        onBackToTools={handleQuickAccessTools}
        onPreviewFile={setPreviewFile}
      />

      <Workbench
        activeFiles={activeFiles}
        currentView={currentView}
        selectedToolKey={selectedToolKey}
        selectedTool={selectedTool}
        sidebarsVisible={sidebarsVisible}
        setSidebarsVisible={setSidebarsVisible}
        previewFile={previewFile}
        setPreviewFile={setPreviewFile}
        pageEditorFunctions={pageEditorFunctions}
        setPageEditorFunctions={setPageEditorFunctions}
        onViewChange={handleViewChange}
        onToolSelect={selectTool}
        onSetLeftPanelView={setLeftPanelView}
        onAddToActiveFiles={addToActiveFiles}
      />

      {/* Global Modals */}
      <FileUploadModal selectedTool={selectedTool} />
    </Group>
  );
}

// Main HomePage component wrapped with FileSelectionProvider
export default function HomePage() {
  return (
    <FileSelectionProvider>
      <HomePageContent />
    </FileSelectionProvider>
  );
}
