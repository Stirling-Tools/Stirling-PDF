import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  useNavigationGuard,
} from "@app/contexts/NavigationContext";
import { isApplyingRestoredView } from "@app/services/workbenchSession";
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
import {
  getStartupNavigationAction,
  getDefaultWorkbenchForFileCount,
} from "@app/utils/homePageNavigation";
import { EDITOR_BASENAME } from "@app/routes/editorBasename";
import { stripBasePath } from "@app/constants/app";
import { HomePageExtensions } from "@app/components/home/HomePageExtensions";
import { QuickNavHostBridge } from "@app/components/shared/quickNav/QuickNavHostBridge";
import type { QuickNavToolReasons } from "@app/contexts/QuickNavHostContext";
import {
  getToolDisabledReason,
  getDisabledLabel,
} from "@app/components/tools/fullscreen/shared";
import { useOtherAppSwitch } from "@app/hooks/useOtherAppSwitch";
import { consumeReaderModeRequest } from "@app/utils/pendingReaderMode";
import {
  FilesPageProvider,
  useFilesPage,
} from "@app/contexts/FilesPageContext";
import { useFolders } from "@app/contexts/FolderContext";
import { useFileHandler } from "@app/hooks/useFileHandler";
import { FolderTreePanel } from "@app/components/filesPage/FolderTreePanel";
import type { FileSidebarProps } from "@app/components/shared/FileSidebar";

import { Button } from "@app/ui/Button";
import "@app/components/layout/WorkspaceFrame.css";
import "@app/pages/HomePage.css";

const SIDEBAR_COLLAPSED_STORAGE_KEY = "stirling.fileSidebarCollapsed";
const SWIPE_HINT_SEEN_STORAGE_KEY = "stirling.mobileSwipeHintSeen";

function readSwipeHintSeen(): boolean {
  try {
    return window.localStorage.getItem(SWIPE_HINT_SEEN_STORAGE_KEY) === "true";
  } catch {
    return true;
  }
}

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
    setReaderMode,
    setLeftPanelView,
    toolAvailability,
    customWorkbenchViews,
    toolRegistry,
  } = useToolWorkflow();

  const navigate = useNavigate();
  const { config } = useAppConfig();
  const isMobile = useIsMobile();
  const isTouch = useIsTouch();
  const sliderRef = useRef<HTMLDivElement | null>(null);
  const [activeMobileView, setActiveMobileView] = useState<MobileView>("tools");
  const isProgrammaticScroll = useRef(false);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const otherApp = useOtherAppSwitch();
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

  useEffect(() => {
    const handler = () => setConfigModalOpen(true);
    window.addEventListener("appConfig:open", handler);
    return () => window.removeEventListener("appConfig:open", handler);
  }, []);

  // Where the user was before settings opened, so close can restore it. Null
  // when opened directly on a /settings URL (deep link) - close falls back to
  // the editor root.
  const settingsOriginRef = useRef<string | null>(null);
  const wasConfigOpenRef = useRef(false);
  useEffect(() => {
    if (configModalOpen && !wasConfigOpenRef.current) {
      settingsOriginRef.current = location.pathname.startsWith("/settings")
        ? null
        : location.pathname;
    }
    wasConfigOpenRef.current = configModalOpen;
  }, [configModalOpen, location.pathname]);

  const handleCloseConfig = useCallback(() => {
    // Restore the URL before clearing the flag, or a late /settings commit
    // re-opens the modal. Read window.location, not useLocation: a tab switch
    // updates the URL synchronously while the router's commit lags. Replace to
    // the origin rather than navigate(-1), which webkit can drop.
    if (stripBasePath(window.location.pathname).startsWith("/settings")) {
      navigate(settingsOriginRef.current ?? EDITOR_BASENAME, { replace: true });
    }
    setConfigModalOpen(false);
  }, [navigate]);

  const { activeFiles } = useFileContext();
  const navigationState = useNavigationState();
  const { requestNavigation } = useNavigationGuard();

  // From the processor's Reader entry. Ref-guarded: one-shot, and StrictMode double-invokes.
  const consumedReaderRequest = useRef(false);
  useEffect(() => {
    if (consumedReaderRequest.current) return;
    consumedReaderRequest.current = true;
    if (consumeReaderModeRequest()) setReaderMode(true);
  }, [setReaderMode]);
  const { actions } = useNavigationActions();

  const { searchInterfaceActions } = useViewer();

  // Reading hides both search controls, so leave it first. e.code, for non-QWERTY layouts.
  const focusSearchAfterRestore = useRef(false);
  useEffect(() => {
    if (!readerMode) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const combo = (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey;
      if (!combo) return;
      if (e.code !== "KeyK" && e.code !== "KeyF") return;
      // Same carve-out the search itself makes: a dialog owns the keyboard.
      if ((e.target as HTMLElement | null)?.closest?.('[role="dialog"]'))
        return;
      e.preventDefault();
      setReaderMode(false);
      if (e.code === "KeyK") {
        focusSearchAfterRestore.current = true;
        return;
      }
      // Visibility is state, so it can open before the bar it renders in exists.
      searchInterfaceActions.open();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [readerMode, setReaderMode, searchInterfaceActions]);

  useEffect(() => {
    if (readerMode || !focusSearchAfterRestore.current) return;
    focusSearchAfterRestore.current = false;
    requestAnimationFrame(() =>
      window.dispatchEvent(new Event("superSearch:focus")),
    );
  }, [readerMode]);

  // Clean slate: no tool, out of the file library and reading.
  const goToDefaultState = useCallback(() => {
    handleBackToTools();
    if (location.pathname.startsWith("/files")) navigate(EDITOR_BASENAME);
    actions.setWorkbench(getDefaultWorkbenchForFileCount(activeFiles.length));
  }, [
    handleBackToTools,
    location.pathname,
    navigate,
    actions,
    activeFiles.length,
  ]);

  // Sync the /files* URL into the workbench state so the file manager view
  // takes over the workbench area when the user lands on it. This is the
  // only state-of-truth for the active workbench, so keep the URL pinned.
  useEffect(() => {
    if (location.pathname.startsWith("/files")) {
      if (navigationState.workbench !== "myFiles") {
        actions.setWorkbench("myFiles");
      }
    } else if (
      navigationState.workbench === "myFiles" &&
      !isApplyingRestoredView()
    ) {
      // The URL no longer supports the file manager - drop back to a sensible default. Stays a
      // state check rather than a transition one: HomePage remounts without NavigationContext
      // (a share link, a login bounce), and the view has to be corrected on arrival too.
      // Skipped mid-restore, which is reopening a recorded view onto files still loading.
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
  // Imperative, so the toggle still works while reading. Never persisted: not a preference.
  const prevReaderModeRef = useRef(readerMode);
  useEffect(() => {
    if (readerMode !== prevReaderModeRef.current) {
      setFileSidebarCollapsed(
        readerMode ? true : readPersistedSidebarCollapsed(),
      );
      prevReaderModeRef.current = readerMode;
    }
  }, [readerMode]);

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

    // A session restore fills an empty workbench too, but it already knows which view the user
    // left - so it wins over this heuristic rather than being overwritten by it.
    if (action && !isApplyingRestoredView()) {
      actions.setWorkbench(action.workbench);
      if (typeof action.activeFileIndex === "number") {
        setActiveFileIndex(action.activeFileIndex);
      }
      if (isMobile) {
        setActiveMobileView("workbench");
      }
    }

    prevFileCountRef.current = currentCount;
  }, [
    activeFiles.length,
    actions,
    setActiveFileIndex,
    selectedToolKey,
    navigationState.workbench,
    isMobile,
  ]);

  const hideToolPanel =
    navigationState.workbench === "myFiles" ||
    (customWorkbenchViews.find(
      (v) => v.workbenchId === navigationState.workbench,
    )?.hideToolPanel ??
      false);

  const brandAltText = t("home.mobile.brandAlt", "Stirling PDF logo");

  // The tool picker's own helpers, so the wording can't drift.
  const quickNavToolReasons = useMemo(() => {
    const reasons: QuickNavToolReasons = {};
    for (const id of ["automate", "sharedSign"] as const) {
      const tool = toolRegistry[id];
      if (!tool) continue;
      const disabledReason = getToolDisabledReason(
        id,
        tool,
        toolAvailability,
        config?.premiumEnabled,
      );
      if (!disabledReason) continue;
      const { key, fallback } = getDisabledLabel(disabledReason);
      reasons[id] = t(key, fallback).replace(/:\s*$/, "");
    }
    return reasons;
  }, [toolRegistry, toolAvailability, config?.premiumEnabled, t]);

  // Shared with the sidebar's own toggle. On /files it leaves rather than collapses.
  const handleSidebarToggle = useCallback(() => {
    if (navigationState.workbench === "myFiles") {
      navigate(EDITOR_BASENAME);
      return;
    }
    setFileSidebarCollapsed((c) => {
      const next = !c;
      writePersistedSidebarCollapsed(next);
      return next;
    });
  }, [navigationState.workbench, navigate]);

  const [showSwipeHint, setShowSwipeHint] = useState(
    () => !readSwipeHintSeen(),
  );
  const dismissSwipeHint = useCallback(() => {
    setShowSwipeHint((shown) => {
      if (shown) {
        try {
          window.localStorage.setItem(SWIPE_HINT_SEEN_STORAGE_KEY, "true");
        } catch {
          // private mode / quota: silently no-op
        }
      }
      return false;
    });
  }, []);

  useEffect(() => {
    if (!isMobile || !isTouch || !showSwipeHint) return;
    const timer = window.setTimeout(dismissSwipeHint, 8000);
    return () => window.clearTimeout(timer);
  }, [isMobile, isTouch, showSwipeHint, dismissSwipeHint]);

  const handleSelectMobileView = useCallback(
    (view: MobileView) => {
      setActiveMobileView(view);
      dismissSwipeHint();
    },
    [dismissSwipeHint],
  );

  // The /files URL pins the workbench to myFiles, so changing view while the
  // file manager is open does nothing until we navigate off it. Desktop leaves
  // via the sidebar's back arrow; mobile renders no sidebar, so without this the
  // bottom bar could not get out of My Files at all.
  const leaveMyFiles = useCallback(() => {
    if (navigationState.workbench === "myFiles") navigate(EDITOR_BASENAME);
  }, [navigationState.workbench, navigate]);

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
        setActiveMobileView((current) => {
          if (current !== nextView) dismissSwipeHint();
          return current === nextView ? current : nextView;
        });
      });
    };

    container.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      container.removeEventListener("scroll", handleScroll);
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [isMobile, dismissSwipeHint]);

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
      <QuickNavHostBridge
        processorAccess={Boolean(otherApp)}
        onOpenSettings={() => setConfigModalOpen(true)}
        requestNavigation={requestNavigation}
        readerMode={readerMode}
        onSetReaderMode={setReaderMode}
        onGoToDefaultState={goToDefaultState}
        onSelectTool={handleToolSelect}
        activeTool={selectedToolKey}
        toolReasons={quickNavToolReasons}
      />
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
                <div className="mobile-brand">
                  <LogoIcon className="mobile-brand-icon" />
                  <Wordmark alt={brandAltText} className="mobile-brand-text" />
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
              <div className="mobile-slider-wrap">
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
                {isTouch && showSwipeHint && (
                  <span className="mobile-swipe-hint" aria-hidden="true">
                    {t(
                      "home.mobile.swipeHint",
                      "Swipe left or right to switch views",
                    )}
                  </span>
                )}
              </div>
            )}
            <div className="mobile-bottom-bar">
              <Button
                variant="tertiary"
                className="mobile-bottom-button"
                aria-label={t("quickAccess.allTools", "Tools")}
                onClick={() => {
                  leaveMyFiles();
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
              </Button>
              {toolAvailability["automate"]?.available !== false && (
                <Button
                  variant="tertiary"
                  className="mobile-bottom-button"
                  aria-label={t("quickAccess.automate", "Automate")}
                  onClick={() => {
                    leaveMyFiles();
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
                </Button>
              )}
              <Button
                variant="tertiary"
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
              </Button>
              <Button
                variant="tertiary"
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
              </Button>
            </div>
            <FileManager selectedTool={selectedTool} />
            <AppConfigModal
              opened={configModalOpen}
              onClose={handleCloseConfig}
            />
          </div>
        ) : (
          <Group
            align="flex-start"
            gap={0}
            h="100%"
            className="flex-nowrap flex"
            bg="var(--c-bg)"
          >
            <div className="workspace-frame">
              <MyFilesAwareFileSidebar
                ref={quickAccessRef}
                accountHoisted
                toggleAriaLabel={
                  navigationState.workbench === "myFiles"
                    ? t("fileSidebar.leaveMyFiles", "Leave File library")
                    : undefined
                }
                toggleIcon={
                  navigationState.workbench === "myFiles" ? (
                    <ArrowBackIcon />
                  ) : undefined
                }
                active={navigationState.workbench === "myFiles"}
                // Forced: a deep link to /files has no transition to collapse on.
                collapsed={
                  navigationState.workbench === "myFiles" ||
                  fileSidebarCollapsed
                }
                onToggleCollapse={handleSidebarToggle}
                onOpenSettings={() => setConfigModalOpen(true)}
              />
            </div>
            <FolderTreePanel active={navigationState.workbench === "myFiles"} />
            <Workbench />
            {!hideToolPanel && <RightSidebar />}
            <FileManager selectedTool={selectedTool} />
            <AppConfigModal
              opened={configModalOpen}
              onClose={handleCloseConfig}
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
