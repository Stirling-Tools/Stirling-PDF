import React, { useCallback, useEffect } from "react";
import { useTranslation } from 'react-i18next';
import { useFileContext } from "../contexts/FileContext";
import { FileSelectionProvider, useFileSelection } from "../contexts/FileSelectionContext";
import { ToolWorkflowProvider, useToolSelection } from "../contexts/ToolWorkflowContext";
import { Group } from "@mantine/core";

import ToolPanel from "../components/tools/ToolPanel";
import Workbench from "../components/layout/Workbench";
import QuickAccessBar from "../components/shared/QuickAccessBar";
import FileUploadModal from "../components/shared/FileUploadModal";

function HomePageContent() {
  const { t } = useTranslation();
  const { setMaxFiles, setIsToolMode, setSelectedFiles } = useFileSelection();

  const { selectedTool } = useToolSelection();

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

  return (
    <Group
      align="flex-start"
      gap={0}
      className="min-h-screen w-screen overflow-hidden flex-nowrap flex"
    >
      <QuickAccessBar />
      <ToolPanel />
      <Workbench />
      <FileUploadModal selectedTool={selectedTool} />
    </Group>
  );
}

export default function HomePage() {
  const { setCurrentView } = useFileContext();
  return (
    <FileSelectionProvider>
      <ToolWorkflowProvider onViewChange={setCurrentView}>
        <HomePageContent />
      </ToolWorkflowProvider>
    </FileSelectionProvider>
  );
}
