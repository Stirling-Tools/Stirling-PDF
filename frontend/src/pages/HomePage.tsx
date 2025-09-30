import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToolWorkflow } from "../contexts/ToolWorkflowContext";
import { ActionIcon, Group } from "@mantine/core";
import { useSidebarContext } from "../contexts/SidebarContext";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
import { getBaseUrl } from "../constants/app";
import { useMediaQuery } from "@mantine/hooks";

import ToolPanel from "../components/tools/ToolPanel";
import Workbench from "../components/layout/Workbench";
import QuickAccessBar from "../components/shared/QuickAccessBar";
import RightRail from "../components/shared/RightRail";
import FileManager from "../components/FileManager";
import LocalIcon from "../components/shared/LocalIcon";
import { useFilesModalContext } from "../contexts/FilesModalContext";

import "./HomePage.css";

type MobileView = "tools" | "workbench";


export default function HomePage() {
  const { t } = useTranslation();
  const {
    sidebarRefs,
  } = useSidebarContext();

  const { quickAccessRef } = sidebarRefs;

  const { selectedTool, selectedToolKey } = useToolWorkflow();

  const { openFilesModal } = useFilesModalContext();
  const isMobile = useMediaQuery("(max-width: 1024px)");
  const sliderRef = useRef<HTMLDivElement | null>(null);
  const [activeMobileView, setActiveMobileView] = useState<MobileView>("tools");

  const handleSelectMobileView = useCallback((view: MobileView) => {
    setActiveMobileView(view);
  }, []);

  useEffect(() => {
    if (isMobile) {
      const container = sliderRef.current;
      if (container) {
        const offset = activeMobileView === "tools" ? 0 : container.clientWidth;
        container.scrollTo({ left: offset, behavior: "smooth" });
      }
      return;
    }

    setActiveMobileView("tools");
    const container = sliderRef.current;
    if (container) {
      container.scrollTo({ left: 0, behavior: "auto" });
    }
  }, [activeMobileView, isMobile]);

  useEffect(() => {
    if (!isMobile) return;

    const container = sliderRef.current;
    if (!container) return;

    let animationFrame = 0;

    const handleScroll = () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }

      animationFrame = window.requestAnimationFrame(() => {
        const { scrollLeft, offsetWidth } = container;
        const threshold = offsetWidth / 2;
        const nextView: MobileView = scrollLeft >= threshold ? "workbench" : "tools";
        setActiveMobileView((current) => (current === nextView ? current : nextView));
      });
    };

    container.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      container.removeEventListener("scroll", handleScroll);
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [isMobile]);

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
    <div className="h-screen overflow-hidden">
      {isMobile ? (
        <div className="mobile-layout">
          <div className="mobile-toggle">
            <div className="flex items-center justify-between">
              <h1 className="text-base font-semibold text-[var(--text-primary)]">
                {selectedTool?.name || t('home.mobile.toolSettings', 'Tool settings')}
              </h1>
              <div className="flex items-center gap-2">
                <ActionIcon
                  variant="subtle"
                  size="lg"
                  aria-label={t('home.mobile.openFiles', 'Open files')}
                  onClick={openFilesModal}
                >
                  <LocalIcon icon="folder-rounded" width="1.5rem" height="1.5rem" />
                </ActionIcon>
              </div>
            </div>
            <div className="mobile-toggle-buttons" role="tablist" aria-label={t('home.mobile.viewSwitcher', 'Switch workspace view')}>
              <button
                type="button"
                role="tab"
                aria-selected={activeMobileView === "tools"}
                className={`mobile-toggle-button ${activeMobileView === "tools" ? "active" : ""}`}
                onClick={() => handleSelectMobileView("tools")}
              >
                {t('home.mobile.tools', 'Tools')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeMobileView === "workbench"}
                className={`mobile-toggle-button ${activeMobileView === "workbench" ? "active" : ""}`}
                onClick={() => handleSelectMobileView("workbench")}
              >
                {t('home.mobile.workspace', 'Workspace')}
              </button>
            </div>
            <span className="mobile-toggle-hint">
              {t('home.mobile.swipeHint', 'Swipe left or right to switch views')}
            </span>
          </div>
          <div ref={sliderRef} className="mobile-slider">
            <div className="mobile-slide" aria-label={t('home.mobile.toolsSlide', 'Tool selection panel')}>
              <div className="mobile-slide-content">
                <ToolPanel />
              </div>
            </div>
            <div className="mobile-slide" aria-label={t('home.mobile.workbenchSlide', 'Workspace panel')}>
              <div className="mobile-slide-content">
                <div className="flex-1 min-h-0 flex flex-col">
                  <Workbench />
                </div>
              </div>
            </div>
          </div>
          <FileManager selectedTool={selectedTool as any /* FIX ME */} />
        </div>
      ) : (
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
      )}
    </div>
  );
}
