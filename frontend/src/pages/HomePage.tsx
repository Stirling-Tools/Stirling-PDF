import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useFileActions, useToolFileSelection } from "../contexts/FileContext";
import { ToolWorkflowProvider, useToolSelection } from "../contexts/ToolWorkflowContext";
import { Group } from "@mantine/core";
import { SidebarProvider, useSidebarContext } from "../contexts/SidebarContext";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
import { getBaseUrl } from "../constants/app";

import ToolPanel from "../components/tools/ToolPanel";
import Workbench from "../components/layout/Workbench";
import QuickAccessBar from "../components/shared/QuickAccessBar";
import FileManager from "../components/FileManager";


function HomePageContent() {
  const { t } = useTranslation();
  const {
    sidebarRefs,
  } = useSidebarContext();

  const { quickAccessRef } = sidebarRefs;

  const { setMaxFiles, setIsToolMode, setSelectedFiles } = useToolFileSelection();

  const { selectedTool } = useToolSelection();

  const baseUrl = getBaseUrl();

  // Update document meta when tool changes
  useDocumentMeta({
    title: selectedTool?.title ? `${selectedTool.title} - Stirling PDF` : 'Stirling PDF',
    description: selectedTool?.description || t('app.description', 'The Free Adobe Acrobat alternative (10M+ Downloads)'),
    ogTitle: selectedTool?.title ? `${selectedTool.title} - Stirling PDF` : 'Stirling PDF',
    ogDescription: selectedTool?.description || t('app.description', 'The Free Adobe Acrobat alternative (10M+ Downloads)'),
    ogImage: selectedTool ? `${baseUrl}/og_images/${selectedTool.id}.png` : `${baseUrl}/og_images/home.png`,
    ogUrl: selectedTool ? `${baseUrl}${window.location.pathname}` : baseUrl
  });

  // Update file selection context when tool changes
  useEffect(() => {
    if (selectedTool) {
      setMaxFiles(selectedTool.maxFiles);
      setIsToolMode(true);
    } else {
      setMaxFiles(-1);
      setIsToolMode(false);
      // Don't clear selections when exiting tool mode - preserve selections for file/page editor
    }
  }, [selectedTool]); // Remove action dependencies to prevent loops

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
      <FileManager selectedTool={selectedTool as any /* FIX ME */} />
    </Group>
  );
}

function HomePageWithProviders() {
  const { actions } = useFileActions();
  
  return (
    <ToolWorkflowProvider onViewChange={actions.setMode as any /* FIX ME */}>
      <SidebarProvider>
        <HomePageContent />
      </SidebarProvider>
    </ToolWorkflowProvider>
  );
}

export default function HomePage() {
  return <HomePageWithProviders />;
}
