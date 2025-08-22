import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useFileContext } from "../contexts/FileContext";
import { FileSelectionProvider, useFileSelection } from "../contexts/FileSelectionContext";
import { ToolWorkflowProvider, useToolWorkflow } from "../contexts/ToolWorkflowContext";
import { Group } from "@mantine/core";
import { SidebarProvider, useSidebarContext } from "../contexts/SidebarContext";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
import { getBaseUrl } from "../constants/app";

import ToolPanel from "../components/tools/ToolPanel";
import Workbench from "../components/layout/Workbench";
import QuickAccessBar from "../components/shared/QuickAccessBar";
import RightRail from "../components/shared/RightRail";
import FileManager from "../components/FileManager";
import { RightRailProvider } from "../contexts/RightRailContext";


function HomePageContent() {
  const { t } = useTranslation();
  const {
    sidebarRefs,
  } = useSidebarContext();

  const { quickAccessRef } = sidebarRefs;

  const { setMaxFiles, setIsToolMode, setSelectedFiles } = useFileSelection();

  const { selectedTool, selectedToolKey } = useToolWorkflow();

  const baseUrl = getBaseUrl();

  // Update document meta when tool changes
  useDocumentMeta({
    title: selectedTool ? `${selectedTool.name} - Stirling PDF` : 'Stirling PDF',
    description: selectedTool?.description || t('app.description', 'The Free Adobe Acrobat alternative (10M+ Downloads)'),
    ogTitle: selectedTool ? `${selectedTool.name} - Stirling PDF` : 'Stirling PDF',
    ogDescription: selectedTool?.description || t('app.description', 'The Free Adobe Acrobat alternative (10M+ Downloads)'),
    ogImage: selectedToolKey ? `${baseUrl}/og_images/${selectedToolKey}.png` : `${baseUrl}/og_images/home.png`,
    ogUrl: selectedTool ? `${baseUrl}${window.location.pathname}` : baseUrl
  });
  // Update file selection context when tool changes
  useEffect(() => {
    if (selectedTool) {
      setMaxFiles(selectedTool.maxFiles ?? -1);
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
      <RightRail />
      <FileManager selectedTool={selectedTool as any /* FIX ME */} />
    </Group>
  );
}

export default function HomePage() {
  const { setCurrentView } = useFileContext();
  return (
    <FileSelectionProvider>
      <ToolWorkflowProvider onViewChange={setCurrentView as any /* FIX ME */}>
        <SidebarProvider>
          <RightRailProvider>
            <HomePageContent />
          </RightRailProvider>
        </SidebarProvider>
      </ToolWorkflowProvider>
    </FileSelectionProvider>
  );
}