import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { Group, useMantineColorScheme } from "@mantine/core";
import { useSidebarContext } from "@app/contexts/SidebarContext";
import { useDocumentMeta } from "@app/hooks/useDocumentMeta";
import { useBaseUrl } from "@app/hooks/useBaseUrl";
import { useIsMobile } from "@app/hooks/useIsMobile";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { useLogoPath } from "@app/hooks/useLogoPath";
import { useLogoAssets } from '@app/hooks/useLogoAssets';
import { useFileContext } from "@app/contexts/file/fileHooks";
import { useNavigationState, useNavigationActions } from "@app/contexts/NavigationContext";
import { useViewer } from "@app/contexts/ViewerContext";
import AppsIcon from '@mui/icons-material/AppsRounded';

import ToolPanel from "@app/components/tools/ToolPanel";
import Workbench from "@app/components/layout/Workbench";
import QuickAccessBar from "@app/components/shared/QuickAccessBar";
import RightRail from "@app/components/shared/RightRail";
import FileManager from "@app/components/FileManager";
import LocalIcon from "@app/components/shared/LocalIcon";
import { useFilesModalContext } from "@app/contexts/FilesModalContext";
import AppConfigModal from "@app/components/shared/AppConfigModal";
import { getStartupNavigationAction } from "@app/utils/homePageNavigation";

import "@app/pages/HomePage.css";

type MobileView = "tools" | "workbench";

export default function HomePage() {
  const { t } = useTranslation();
  const {
    sidebarRefs,
  } = useSidebarContext();

  const { quickAccessRef } = sidebarRefs;

  const {
    selectedTool,
    selectedToolKey,
    handleToolSelect,
    handleBackToTools,
    readerMode,
    setLeftPanelView,
    toolAvailability,
  } = useToolWorkflow();

  const { openFilesModal } = useFilesModalContext();
  const { colorScheme } = useMantineColorScheme();
  const { config } = useAppConfig();
  const isMobile = useIsMobile();
  const sliderRef = useRef<HTMLDivElement | null>(null);
  const [activeMobileView, setActiveMobileView] = useState<MobileView>("tools");
  const isProgrammaticScroll = useRef(false);
  const [configModalOpen, setConfigModalOpen] = useState(false);

  const { activeFiles } = useFileContext();
  const navigationState = useNavigationState();
  const { actions } = useNavigationActions();
  const { setActiveFileIndex } = useViewer();
  const prevFileCountRef = useRef(activeFiles.length);

  // Startup/open transition behavior:
  // - opening exactly 1 file from empty -> viewer (unless already in fileEditor)
  // - opening 2+ files from empty -> fileEditor
  useEffect(() => {
    const prevCount = prevFileCountRef.current;
    const currentCount = activeFiles.length;

    const action = getStartupNavigationAction(
      prevCount,
      currentCount,
      selectedToolKey,
      navigationState.workbench
    );
    if (action) {
      actions.setWorkbench(action.workbench);
      if (typeof action.activeFileIndex === 'number') {
        setActiveFileIndex(action.activeFileIndex);
      }
    }

    prevFileCountRef.current = currentCount;
  }, [
    activeFiles.length,
    actions,
    setActiveFileIndex,
    selectedToolKey,
    navigationState.workbench,
  ]);

  const brandAltText = t("home.mobile.brandAlt", "Stirling PDF logo");
  const brandIconSrc = useLogoPath();
  const { wordmark } = useLogoAssets();
  const brandTextSrc = colorScheme === "dark" ? wordmark.white : wordmark.black;

  const handleSelectMobileView = useCallback((view: MobileView) => {
    setActiveMobileView(view);
  }, []);

  useEffect(() => {
    if (isMobile) {
      const container = sliderRef.current;
      if (container) {
        isProgrammaticScroll.current = true;
        const offset = activeMobileView === "tools" ? 0 : container.offsetWidth;
        container.scrollTo({ left: offset, behavior: "smooth" });

        // Re-enable scroll listener after animation completes
        setTimeout(() => {
          isProgrammaticScroll.current = false;
        }, 500);
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
      if (isProgrammaticScroll.current) {
        return;
      }

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

  // Automatically switch to workbench when read mode or multiTool is activated in mobile
  useEffect(() => {
    if (isMobile && (readerMode || selectedToolKey === 'multiTool')) {
      setActiveMobileView('workbench');
    }
  }, [isMobile, readerMode, selectedToolKey]);

  // When navigating back to tools view in mobile with a workbench-only tool, show tool picker
  useEffect(() => {
    if (isMobile && activeMobileView === 'tools' && selectedTool) {
      // Check if this is a workbench-only tool (has workbench but no component)
      if (selectedTool.workbench && !selectedTool.component) {
        setLeftPanelView('toolPicker');
      }
    }
  }, [isMobile, activeMobileView, selectedTool, setLeftPanelView]);

  const baseUrl = useBaseUrl();

  // Update document meta when tool changes
  const appName = config?.appNameNavbar || 'Stirling PDF';
  useDocumentMeta({
    title: selectedTool ? `${selectedTool.name} - ${appName}` : appName,
    description: selectedTool?.description || t('app.description', 'The Free Adobe Acrobat alternative (10M+ Downloads)'),
    ogTitle: selectedTool ? `${selectedTool.name} - ${appName}` : appName,
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
            <div className="mobile-header">
              <div className="mobile-brand">
                <img src={brandIconSrc} alt="" aria-hidden="true" className="mobile-brand-icon" />
                <img src={brandTextSrc} alt={brandAltText} className="mobile-brand-text" />
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
                <div className="flex-1 min-h-0 flex">
                  <Workbench />
                  <RightRail />
                </div>
              </div>
            </div>
          </div>
          <div className="mobile-bottom-bar">
            <button
              className="mobile-bottom-button"
              aria-label={t('quickAccess.allTools', 'Tools')}
              onClick={() => {
                handleBackToTools();
                if (isMobile) {
                  setActiveMobileView('tools');
                }
              }}
            >
              <AppsIcon sx={{ fontSize: '1.5rem' }} />
              <span className="mobile-bottom-button-label">{t('quickAccess.allTools', 'Tools')}</span>
            </button>
            {toolAvailability['automate']?.available !== false && (
              <button
                className="mobile-bottom-button"
                aria-label={t('quickAccess.automate', 'Automate')}
                onClick={() => {
                  handleToolSelect('automate');
                  if (isMobile) {
                    setActiveMobileView('tools');
                  }
                }}
              >
                <LocalIcon icon="automation-outline" width="1.5rem" height="1.5rem" />
                <span className="mobile-bottom-button-label">{t('quickAccess.automate', 'Automate')}</span>
              </button>
            )}
            <button
              className="mobile-bottom-button"
              aria-label={t('home.mobile.openFiles', 'Open files')}
              onClick={() => openFilesModal()}
            >
              <LocalIcon icon="folder-rounded" width="1.5rem" height="1.5rem" />
              <span className="mobile-bottom-button-label">{t('quickAccess.files', 'Files')}</span>
            </button>
            <button
              className="mobile-bottom-button"
              aria-label={t('quickAccess.config', 'Config')}
              onClick={() => setConfigModalOpen(true)}
            >
              <LocalIcon icon="settings-rounded" width="1.5rem" height="1.5rem" />
              <span className="mobile-bottom-button-label">{t('quickAccess.config', 'Config')}</span>
            </button>
          </div>
          <FileManager selectedTool={selectedTool as any /* FIX ME */} />
          <AppConfigModal
            opened={configModalOpen}
            onClose={() => setConfigModalOpen(false)}
          />
        </div>
      ) : (
        <Group
          align="flex-start"
          gap={0}
          h="100%"
          className="flex-nowrap flex"
        >
          <QuickAccessBar ref={quickAccessRef} />
          <ToolPanel />
          <Workbench />
          <RightRail />
          <FileManager selectedTool={selectedTool as any /* FIX ME */} />
        </Group>
      )}
    </div>
  );
}
