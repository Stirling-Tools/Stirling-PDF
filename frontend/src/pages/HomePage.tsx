import React from "react";
import { useTranslation } from "react-i18next";
import { useToolWorkflow } from "../contexts/ToolWorkflowContext";
import { Group } from "@mantine/core";
import { useSidebarContext } from "../contexts/SidebarContext";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
import { useBaseUrl } from "../constants/app";

import ToolPanel from "../components/tools/ToolPanel";
import Workbench from "../components/layout/Workbench";
import QuickAccessBar from "../components/shared/QuickAccessBar";
import RightRail from "../components/shared/RightRail";
import FileManager from "../components/FileManager";


export default function HomePage() {
  const { t } = useTranslation();
  const {
    sidebarRefs,
  } = useSidebarContext();

  const { quickAccessRef } = sidebarRefs;

  const { selectedTool, selectedToolKey } = useToolWorkflow();

  const baseUrl = useBaseUrl();

  // Update document meta when tool changes
  useDocumentMeta({
    title: selectedTool ? `${selectedTool.name} - Stirling PDF` : 'Stirling PDF',
    description: selectedTool?.description ?? t('app.description', 'The Free Adobe Acrobat alternative (10M+ Downloads)'),
    ogTitle: selectedTool ? `${selectedTool.name} - Stirling PDF` : 'Stirling PDF',
    ogDescription: selectedTool?.description ?? t('app.description', 'The Free Adobe Acrobat alternative (10M+ Downloads)'),
    ogImage: selectedToolKey ? `${baseUrl}/og_images/${selectedToolKey}.png` : `${baseUrl}/og_images/home.png`,
    ogUrl: selectedTool ? `${baseUrl}${window.location.pathname}` : baseUrl
  });

  // Note: File selection limits are now handled directly by individual tools

  return (
    <div className="h-screen overflow-hidden">
      <Group
        align="flex-start"
        gap={0}
        h="100%"
        className="flex-nowrap flex"
      >
        <QuickAccessBar
          ref={quickAccessRef} />
        <ToolPanel />
        <Workbench />
        <RightRail />
        <FileManager selectedTool={selectedTool as any /* FIX ME */} />
      </Group>
    </div>
  );
}
