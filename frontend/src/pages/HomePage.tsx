import React, { useEffect } from "react";
import { useFileContext } from "../contexts/FileContext";
import { FileSelectionProvider, useFileSelection } from "../contexts/FileSelectionContext";
import { ToolWorkflowProvider, useToolSelection } from "../contexts/ToolWorkflowContext";
import { Group } from "@mantine/core";
import { SidebarProvider, useSidebarContext } from "../contexts/SidebarContext";

import ToolPanel from "../components/tools/ToolPanel";
import Workbench from "../components/layout/Workbench";
import QuickAccessBar from "../components/shared/QuickAccessBar";
import FileManager from "../components/FileManager";


function HomePageContent() {
  const { 
    sidebarRefs, 
  } = useSidebarContext();
  
  const { quickAccessRef } = sidebarRefs;

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
      <QuickAccessBar
        ref={quickAccessRef} />
      <ToolPanel />
      <Workbench />
      <FileManager selectedTool={selectedTool} />
    </Group>
  );
}

export default function HomePage() {
  const { setCurrentView } = useFileContext();
  return (
    <FileSelectionProvider>
      <ToolWorkflowProvider onViewChange={setCurrentView}>
        <SidebarProvider>
          <HomePageContent />
        </SidebarProvider>
      </ToolWorkflowProvider>
    </FileSelectionProvider>
  );
}
