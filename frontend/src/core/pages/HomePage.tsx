import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { Group } from "@mantine/core";
import { useSidebarContext } from "@app/contexts/SidebarContext";
import { useDocumentMeta } from "@app/hooks/useDocumentMeta";
import { useBaseUrl } from "@app/hooks/useBaseUrl";
import { useIsMobile } from "@app/hooks/useIsMobile";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { LogoIcon } from "@app/components/shared/LogoIcon";
import { Wordmark } from "@app/components/shared/Wordmark";
import { useFileContext } from "@app/contexts/file/fileHooks";
import {
  useNavigationState,
  useNavigationActions,
} from "@app/contexts/NavigationContext";
import { useViewer } from "@app/contexts/ViewerContext";
import { useLocation, useNavigate } from "react-router-dom";
import AppsIcon from "@mui/icons-material/AppsRounded";

import ToolPanel from "@app/components/tools/ToolPanel";
import Workbench from "@app/components/layout/Workbench";
import FileSidebar from "@app/components/shared/FileSidebar";
import FileManager from "@app/components/FileManager";
import LocalIcon from "@app/components/shared/LocalIcon";
import AppConfigModal from "@app/components/shared/AppConfigModalLazy";
import { getStartupNavigationAction } from "@app/utils/homePageNavigation";
import { HomePageExtensions } from "@app/components/home/HomePageExtensions";
import { FilesPageProvider } from "@app/contexts/FilesPageContext";
import { FolderTreePanel } from "@app/components/filesPage/FolderTreePanel";

import "@app/pages/HomePage.css";

type MobileView = "tools" | "workbench";

export default function HomePage() {
  const { t } = useTranslation();
  const { sidebarRefs } = useSidebarContext();

  const { quickAccessRef } = sidebarRefs;

  const {
    selectedTool,
    selectedToolKey,
    handleToolSelect,
    handleBackToTools,
    readerMode,
    setLeftPanelView,
    toolAvailability,
    customWorkbenchViews,
  } = useToolWorkflow();

  const navigate = useNavigate();
  const { config } = useAppConfig();
  const isMobile = useIsMobile();
  const sliderRef = useRef<HTMLDivElement | null>(null);
  const [activeMobileView, setActiveMobileView] = useState<MobileView>("tools");
  const isProgrammaticScroll = useRef(false);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const location = useLocation();
  // Start the sidebar collapsed if we mount directly on /files, so the
  // expand→collapse CSS transition doesn't leave the browser with a stale
  // 260px layout box.
  const [fileSidebarCollapsed, setFileSidebarCollapsed] = useState(
    () => location.pathname.startsWith("/files"),
  );

  // Open the config modal whenever the URL is /settings/* (e.g. from the admin
  // tour's openConfigModal action which navigates to /settings/overview).
  useEffect(() => {
    const isSettings = location.pathname.startsWith("/settings");
    setConfigModalOpen(isSettings);
  }, [location.pathname]);

  const { activeFiles } = useFileContext();
  const navigationState = useNavigationState();
  const { actions } = useNavigationActions();

  // Sync the /files* URL into the workbench state so the file manager view
  // takes over the workbench area when the user lands on it. This is the
  // only state-of-truth for the active workbench, so keep the URL pinned.
  useEffect(() => {
    if (location.pathname.startsWith("/files")) {
      if (navigationState.workbench !== "myFiles") {
        actions.setWorkbench("myFiles");
      }
    } else if (navigationState.workbench === "myFiles") {
      // Leaving the file manager — drop back to a sensible default.
      actions.setWorkbench(activeFiles.length > 1 ? "fileEditor" : "viewer");
    }
  }, [location.pathname, navigationState.workbench, actions, activeFiles.length]);

  // Auto-collapse the FileSidebar in My Files (the workbench already shows
  // the folder tree and file grid, so the sidebar's recent-files list is
  // redundant). Remember the user's pre-collapse state so we can restore it
  // when they leave the view. If the user direct-navigated to /files,
  // default the restore-state to expanded so leaving feels normal.
  const previousSidebarCollapsedRef = useRef<boolean | null>(
    location.pathname.startsWith("/files") ? false : null,
  );
  useEffect(() => {
    if (navigationState.workbench === "myFiles") {
      if (previousSidebarCollapsedRef.current === null) {
        previousSidebarCollapsedRef.current = fileSidebarCollapsed;
      }
      if (!fileSidebarCollapsed) {
        setFileSidebarCollapsed(true);
      }
    } else if (previousSidebarCollapsedRef.current !== null) {
      setFileSidebarCollapsed(previousSidebarCollapsedRef.current);
      previousSidebarCollapsedRef.current = null;
    }
    // Intentionally only reacts to workbench changes. Reading
    // `fileSidebarCollapsed` here is a snapshot for the restore-ref capture;
    // re-running on every sidebar toggle would clobber user intent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigationState.workbench]);
  const { setActiveFileIndex } = useViewer();
  const prevFileCountRef = useRef(activeFiles.length);

  // Startup/open transition behavior:
  // - opening exactly 1 file from empty -> viewer (unless already in fileEditor)
  // - opening 2+ files from empty -> fileEditor
  useEffect(() => {
    const prevCount = prevFileCountRef.current;
    const currentCount = activeFiles.length;

    console.log("[HomePage] Navigation effect triggered:", {
      prevCount,
      currentCount,
      currentWorkbench: navigationState.workbench,
      selectedToolKey,
    });

    const action = getStartupNavigationAction(
      prevCount,
      currentCount,
      selectedToolKey,
      navigationState.workbench,
    );

    console.log("[HomePage] Navigation action returned:", action);

    if (action) {
      console.log("[HomePage] Applying navigation:", action);
      actions.setWorkbench(action.workbench);
      if (typeof action.activeFileIndex === "number") {
        setActiveFileIndex(action.activeFileIndex);
      }
    } else {
      console.log("[HomePage] No navigation - staying in current workbench");
    }

    prevFileCountRef.current = currentCount;
  }, [
    activeFiles.length,
    actions,
    setActiveFileIndex,
    selectedToolKey,
    navigationState.workbench,
  ]);

  const hideToolPanel =
    navigationState.workbench === "myFiles" ||
    (customWorkbenchViews.find(
      (v) => v.workbenchId === navigationState.workbench,
    )?.hideToolPanel ?? false);

  const brandAltText = t("home.mobile.brandAlt", "Stirling PDF logo");

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
        const nextView: MobileView =
          scrollLeft >= threshold ? "workbench" : "tools";
        setActiveMobileView((current) =>
          current === nextView ? current : nextView,
        );
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
    if (isMobile && (readerMode || selectedToolKey === "multiTool")) {
      setActiveMobileView("workbench");
    }
  }, [isMobile, readerMode, selectedToolKey]);

  // Automatically switch to workbench slide when a custom workbench (e.g. signing) is active on mobile.
  // hideToolPanel is true for all custom workbenches that take over the full screen.
  useEffect(() => {
    if (isMobile && hideToolPanel) {
      setActiveMobileView("workbench");
    }
  }, [isMobile, hideToolPanel]);

  // When navigating back to tools view in mobile with a workbench-only tool, show tool picker
  useEffect(() => {
    if (isMobile && activeMobileView === "tools" && selectedTool) {
      // Check if this is a workbench-only tool (has workbench but no component)
      if (selectedTool.workbench && !selectedTool.component) {
        setLeftPanelView("toolPicker");
      }
    }
  }, [isMobile, activeMobileView, selectedTool, setLeftPanelView]);

  const baseUrl = useBaseUrl();

  // Update document meta when tool changes
  const appName = config?.appNameNavbar || "Stirling PDF";
  useDocumentMeta({
    title: selectedTool ? `${selectedTool.name} - ${appName}` : appName,
    description:
      selectedTool?.description ||
      t(
        "app.description",
        "The Free Adobe Acrobat alternative (10M+ Downloads)",
      ),
    ogTitle: selectedTool ? `${selectedTool.name} - ${appName}` : appName,
    ogDescription:
      selectedTool?.description ||
      t(
        "app.description",
        "The Free Adobe Acrobat alternative (10M+ Downloads)",
      ),
    ogImage: selectedToolKey
      ? `${baseUrl}/og_images/${selectedToolKey}.png`
      : `${baseUrl}/og_images/home.png`,
    ogUrl: selectedTool ? `${baseUrl}${window.location.pathname}` : baseUrl,
  });

  // Note: File selection limits are now handled directly by individual tools

  return (
    <div className="h-screen overflow-hidden">
      <HomePageExtensions />
      <FilesPageProvider>
      {isMobile ? (
        <div className="mobile-layout">
          <div className="mobile-toggle">
            <div className="mobile-header">
              <div className="mobile-brand">
                <LogoIcon className="mobile-brand-icon" />
                <Wordmark alt={brandAltText} className="mobile-brand-text" />
              </div>
            </div>
            <div
              className="mobile-toggle-buttons"
              role="tablist"
              aria-label={t(
                "home.mobile.viewSwitcher",
                "Switch workspace view",
              )}
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeMobileView === "tools"}
                className={`mobile-toggle-button ${activeMobileView === "tools" ? "active" : ""}`}
                onClick={() => handleSelectMobileView("tools")}
              >
                {t("home.mobile.tools", "Tools")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeMobileView === "workbench"}
                className={`mobile-toggle-button ${activeMobileView === "workbench" ? "active" : ""}`}
                onClick={() => handleSelectMobileView("workbench")}
              >
                {t("home.mobile.workspace", "Workspace")}
              </button>
            </div>
            <span className="mobile-toggle-hint">
              {t(
                "home.mobile.swipeHint",
                "Swipe left or right to switch views",
              )}
            </span>
          </div>
          <div ref={sliderRef} className="mobile-slider">
            <div
              className="mobile-slide"
              aria-label={t("home.mobile.toolsSlide", "Tool selection panel")}
            >
              <div className="mobile-slide-content">
                <ToolPanel />
              </div>
            </div>
            <div
              className="mobile-slide"
              aria-label={t("home.mobile.workbenchSlide", "Workspace panel")}
            >
              <div className="mobile-slide-content">
                <div className="flex-1 min-h-0 flex">
                  <Workbench />
                </div>
              </div>
            </div>
          </div>
          <div className="mobile-bottom-bar">
            <button
              className="mobile-bottom-button"
              aria-label={t("quickAccess.allTools", "Tools")}
              onClick={() => {
                handleBackToTools();
                if (isMobile) {
                  setActiveMobileView("tools");
                }
              }}
            >
              <AppsIcon sx={{ fontSize: "1.5rem" }} />
              <span className="mobile-bottom-button-label">
                {t("quickAccess.allTools", "Tools")}
              </span>
            </button>
            {toolAvailability["automate"]?.available !== false && (
              <button
                className="mobile-bottom-button"
                aria-label={t("quickAccess.automate", "Automate")}
                onClick={() => {
                  handleToolSelect("automate");
                  if (isMobile) {
                    setActiveMobileView("tools");
                  }
                }}
              >
                <LocalIcon
                  icon="automation-outline"
                  width="1.5rem"
                  height="1.5rem"
                />
                <span className="mobile-bottom-button-label">
                  {t("quickAccess.automate", "Automate")}
                </span>
              </button>
            )}
            <button
              className="mobile-bottom-button"
              aria-label={t("home.mobile.openFiles", "Open files")}
              onClick={() => navigate("/files")}
            >
              <LocalIcon icon="folder-rounded" width="1.5rem" height="1.5rem" />
              <span className="mobile-bottom-button-label">
                {t("quickAccess.files", "Files")}
              </span>
            </button>
            <button
              className="mobile-bottom-button"
              aria-label={t("quickAccess.config", "Config")}
              onClick={() => setConfigModalOpen(true)}
            >
              <LocalIcon
                icon="settings-rounded"
                width="1.5rem"
                height="1.5rem"
              />
              <span className="mobile-bottom-button-label">
                {t("quickAccess.config", "Config")}
              </span>
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
            <FileSidebar
              ref={quickAccessRef}
              collapsed={fileSidebarCollapsed}
              toggleAriaLabel={
                navigationState.workbench === "myFiles"
                  ? t("fileSidebar.leaveMyFiles", "Leave My Files")
                  : undefined
              }
              onToggleCollapse={() => {
                // While in My Files the FolderTreePanel already occupies
                // the left rail. Expanding the FileSidebar on top would
                // stack two panels, so the burger here acts as "leave
                // My Files" — navigate back home. The FileSidebar's
                // auto-collapse effect will then restore its previous
                // expanded state.
                if (navigationState.workbench === "myFiles") {
                  navigate("/");
                  return;
                }
                setFileSidebarCollapsed((c) => !c);
              }}
              onOpenSettings={() => setConfigModalOpen(true)}
            />
            <FolderTreePanel active={navigationState.workbench === "myFiles"} />
            <Workbench />
            {!hideToolPanel && <ToolPanel />}
            <FileManager selectedTool={selectedTool as any /* FIX ME */} />
            <AppConfigModal
              opened={configModalOpen}
              onClose={() => setConfigModalOpen(false)}
            />
          </Group>
      )}
      </FilesPageProvider>
    </div>
  );
}
