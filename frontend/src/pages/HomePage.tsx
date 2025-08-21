import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useFileActions, useFileSelection } from "../contexts/FileContext";
import { useNavigationActions } from "../contexts/NavigationContext";
import { ToolWorkflowProvider, useToolWorkflow } from "../contexts/ToolWorkflowContext";
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

  const { setSelectedFiles } = useFileSelection();

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

  // Note: File selection limits are now handled directly by individual tools

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
  const { actions } = useNavigationActions();
  
  // Wrapper to convert string to ModeType
  const handleViewChange = (view: string) => {
    actions.setMode(view as any); // ToolWorkflowContext should validate this
  };
  
  return (
    <ToolWorkflowProvider onViewChange={handleViewChange}>
      <SidebarProvider>
        <HomePageContent />
      </SidebarProvider>
    </ToolWorkflowProvider>
  );
}

export default function HomePage() {
  return <HomePageWithProviders />;
}
