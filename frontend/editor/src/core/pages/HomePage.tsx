import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { Group } from "@mantine/core";
import { useSidebarContext } from "@app/contexts/SidebarContext";
import { useDocumentMeta } from "@app/hooks/useDocumentMeta";
import { getToolOgImage } from "@app/data/ogImage";
import { useBaseUrl } from "@app/hooks/useBaseUrl";
import { useIsMobile, useIsTouch } from "@app/hooks/useIsMobile";
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
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CreateNewFolderIcon from "@mui/icons-material/CreateNewFolder";

import RightSidebar from "@app/components/tools/RightSidebar";
import Workbench from "@app/components/layout/Workbench";
import FileSidebar from "@app/components/shared/FileSidebar";
import FileManager from "@app/components/FileManager";
import LocalIcon from "@app/components/shared/LocalIcon";
import AppConfigModal from "@app/components/shared/AppConfigModalLazy";
import { getStartupNavigationAction } from "@app/utils/homePageNavigation";
import { HomePageExtensions } from "@app/components/home/HomePageExtensions";
import {
  FilesPageProvider,
  useFilesPage,
} from "@app/contexts/FilesPageContext";
import { useFolders } from "@app/contexts/FolderContext";
import { useFileHandler } from "@app/hooks/useFileHandler";
import { FolderTreePanel } from "@app/components/filesPage/FolderTreePanel";
import type { FileSidebarProps } from "@app/components/shared/FileSidebar";

import "@app/pages/HomePage.css";

const SIDEBAR_COLLAPSED_STORAGE_KEY = "stirling.fileSidebarCollapsed";

function readPersistedSidebarCollapsed(): boolean {
  try {
    return (
      window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true"
    );
  } catch {
    return false;
  }
}

function writePersistedSidebarCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(
      SIDEBAR_COLLAPSED_STORAGE_KEY,
      String(collapsed),
    );
  } catch {
    // private mode / quota: silently no-op
  }
}

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
  const isTouch = useIsTouch();
  const sliderRef = useRef<HTMLDivElement | null>(null);
  const [activeMobileView, setActiveMobileView] = useState<MobileView>("tools");
  const isProgrammaticScroll = useRef(false);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const location = useLocation();
  // Persisted user preference for the FileSidebar collapsed state. Auto-
  // collapse on /files is layered on top in the transition effect below and
  // doesn't write to storage, so deep-linking to /files won't overwrite what
  // the user actually chose last time.
  const [fileSidebarCollapsed, setFileSidebarCollapsed] = useState(
    readPersistedSidebarCollapsed,
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
      // Leaving the file manager - drop back to a sensible default.
      actions.setWorkbench(activeFiles.length > 1 ? "fileEditor" : "viewer");
    }
  }, [
    location.pathname,
    navigationState.workbench,
    actions,
    activeFiles.length,
  ]);

  // Auto-collapse the FileSidebar while on /files; restore the user's persisted
  // preference on leave. Auto-collapse doesn't write to storage so deep-linking
  // to /files won't overwrite what the user actually chose.
  const prevWorkbenchRef = useRef(navigationState.workbench);
  useEffect(() => {
    const prev = prevWorkbenchRef.current;
    const curr = navigationState.workbench;
    if (curr === "myFiles" && prev !== "myFiles") {
      if (!fileSidebarCollapsed) setFileSidebarCollapsed(true);
    } else if (curr !== "myFiles" && prev === "myFiles") {
      setFileSidebarCollapsed(readPersistedSidebarCollapsed());
    }
    prevWorkbenchRef.current = curr;
    // fileSidebarCollapsed read as snapshot on transition only.
  }, [navigationState.workbench]);
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
      navigationState.workbench,
    );

    if (action) {
      actions.setWorkbench(action.workbench);
      if (typeof action.activeFileIndex === "number") {
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

  const hideToolPanel =
    navigationState.workbench === "myFiles" ||
    (customWorkbenchViews.find(
      (v) => v.workbenchId === navigationState.workbench,
    )?.hideToolPanel ??
      false);

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
    ogImage: getToolOgImage(baseUrl, selectedToolKey),
    ogUrl: selectedTool ? `${baseUrl}${window.location.pathname}` : baseUrl,
  });

  // Note: File selection limits are now handled directly by individual tools

  return (
    <div className="h-screen overflow-hidden">
      <HomePageExtensions />
      <FilesPageProvider>
        {isMobile ? (
          <div
            className="mobile-layout"
            data-files-mode={navigationState.workbench === "myFiles"}
          >
            {/* On /files the FileManagerView already has its own Back +
              breadcrumb + tabs chrome - the tools/workspace toggle would
              just duplicate vertical space. Keep the toggle on every
              other route. */}
            {navigationState.workbench !== "myFiles" && (
              <div className="mobile-toggle">
                <div className="mobile-header">
                  <div className="mobile-brand">
                    <LogoIcon className="mobile-brand-icon" />
                    <Wordmark
                      alt={brandAltText}
                      className="mobile-brand-text"
                    />
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
                {isTouch && (
                  <span className="mobile-toggle-hint">
                    {t(
                      "home.mobile.swipeHint",
                      "Swipe left or right to switch views",
                    )}
                  </span>
                )}
              </div>
            )}
            {navigationState.workbench === "myFiles" ? (
              /* /files takes the whole viewport. Skipping the slider keeps
                the FileManagerView from being trapped inside a 100vw
                horizontal-scroll container (which truncated buttons and
                created a stray side-scroll surface on touch). */
              <div className="mobile-files-full">
                <div className="flex-1 min-h-0 flex" style={{ minWidth: 0 }}>
                  <Workbench />
                </div>
              </div>
            ) : (
              <div ref={sliderRef} className="mobile-slider">
                <div
                  className="mobile-slide"
                  aria-label={t(
                    "home.mobile.toolsSlide",
                    "Tool selection panel",
                  )}
                >
                  <div className="mobile-slide-content">
                    <RightSidebar />
                  </div>
                </div>
                <div
                  className="mobile-slide"
                  aria-label={t(
                    "home.mobile.workbenchSlide",
                    "Workspace panel",
                  )}
                >
                  <div className="mobile-slide-content">
                    <div
                      className="flex-1 min-h-0 flex"
                      style={{ minWidth: 0 }}
                    >
                      <Workbench />
                    </div>
                  </div>
                </div>
              </div>
            )}
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
                <LocalIcon
                  icon="folder-rounded"
                  width="1.5rem"
                  height="1.5rem"
                />
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
            <FileManager selectedTool={selectedTool} />
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
            <MyFilesAwareFileSidebar
              ref={quickAccessRef}
              active={navigationState.workbench === "myFiles"}
              // /files always shows the rail collapsed - force it here so a
              // deep-link/reload onto /files (no workbench transition) still
              // collapses, and a manual expand can't stick.
              collapsed={
                navigationState.workbench === "myFiles" || fileSidebarCollapsed
              }
              toggleAriaLabel={
                navigationState.workbench === "myFiles"
                  ? t("fileSidebar.leaveMyFiles", "Leave My Files")
                  : undefined
              }
              // Back-arrow on /files; burger elsewhere.
              toggleIcon={
                navigationState.workbench === "myFiles" ? (
                  <ArrowBackIcon />
                ) : undefined
              }
              onToggleCollapse={() => {
                if (navigationState.workbench === "myFiles") {
                  navigate("/");
                  return;
                }
                setFileSidebarCollapsed((c) => {
                  const next = !c;
                  writePersistedSidebarCollapsed(next);
                  return next;
                });
              }}
              onOpenSettings={() => setConfigModalOpen(true)}
            />
            <FolderTreePanel active={navigationState.workbench === "myFiles"} />
            <Workbench />
            {!hideToolPanel && <RightSidebar />}
            <FileManager selectedTool={selectedTool} />
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

interface MyFilesAwareFileSidebarProps extends FileSidebarProps {
  active: boolean;
}

/** Wraps FileSidebar with /files-aware overrides when `active`. */
const MyFilesAwareFileSidebar = forwardRef<
  HTMLDivElement,
  MyFilesAwareFileSidebarProps
>(function MyFilesAwareFileSidebar(props, ref) {
  const { active, ...rest } = props;
  if (!active) {
    return <FileSidebar ref={ref} {...rest} />;
  }
  return <MyFilesSidebarOverrides ref={ref} {...rest} />;
});

const MyFilesSidebarOverrides = forwardRef<HTMLDivElement, FileSidebarProps>(
  function MyFilesSidebarOverrides(props, ref) {
    const { t } = useTranslation();
    const filesPage = useFilesPage();
    const folders = useFolders();
    const { addFiles } = useFileHandler();

    const handleUpload = useCallback(
      async (files: File[]) => {
        const added = await addFiles(files, { skipWorkspaceDispatch: true });
        await filesPage.refresh();
        // If the user is inside a cloud folder, place uploads there.
        if (folders.currentFolderId !== null && added.length > 0) {
          await filesPage.moveFilesTo(
            added.map((f) => f.fileId),
            folders.currentFolderId,
          );
        }
      },
      [addFiles, filesPage, folders.currentFolderId],
    );

    const newFolderDisabledReason = !folders.serverReachable
      ? t(
          "filesPage.newFolderStorageDisabled",
          "Server folder storage isn't enabled. Ask your admin to turn it on.",
        )
      : null;

    return (
      <FileSidebar
        ref={ref}
        {...props}
        onSearchClick={() => {
          // Just focus the central search field; don't toggle collapse
          // (which on /files navigates back home).
          window.dispatchEvent(new Event("files-page:focus-search"));
        }}
        onUploadFiles={handleUpload}
        onPickGoogleDriveFiles={handleUpload}
        extraAction={{
          icon: <CreateNewFolderIcon />,
          label: t("filesPage.newFolder", "New folder"),
          onClick: () => filesPage.openNewFolderDialog(),
          disabled: newFolderDisabledReason !== null,
          disabledTooltip: newFolderDisabledReason ?? undefined,
          testId: "files-rail-new-folder",
        }}
      />
    );
  },
);
