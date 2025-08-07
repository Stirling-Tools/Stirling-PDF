import React, { useCallback, useEffect } from "react";
import { useTranslation } from 'react-i18next';
import { useFileContext } from "../contexts/FileContext";
import { FileSelectionProvider, useFileSelection } from "../contexts/FileSelectionContext";
import { ToolWorkflowProvider, useToolSelection } from "../contexts/ToolWorkflowContext";
import { useFileHandler } from "../hooks/useFileHandler";
import { Group } from "@mantine/core";

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

  const { selectedTool, selectedToolKey } = useToolSelection();

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

  // These handlers are now provided by the context
  // The context handles the coordination between tool selection and UI state

  const handleViewChange = useCallback((view: string) => {
    setCurrentView(view as any);
  }, [setCurrentView]);

  return (
    <Group
      align="flex-start"
      gap={0}
      className="min-h-screen w-screen overflow-hidden flex-nowrap flex"
    >
      <QuickAccessBar />

      <ToolPanel />

      <Workbench
        activeFiles={activeFiles}
        currentView={currentView}
        onViewChange={handleViewChange}
        onAddToActiveFiles={addToActiveFiles}
      />

      {/* Global Modals */}
      <FileUploadModal selectedTool={selectedTool} />
    </Group>
  );
}

// HomePage wrapper that connects context to file context  
function HomePageWrapper() {
  const { setCurrentView } = useFileContext();

  return (
    <ToolWorkflowProvider onViewChange={setCurrentView}>
      <HomePageContent />
    </ToolWorkflowProvider>
  );
}

// Main HomePage component wrapped with providers
export default function HomePage() {
  return (
    <FileSelectionProvider>
      <HomePageWrapper />
    </FileSelectionProvider>
  );
}
