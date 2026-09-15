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

import { Icon } from "@app/ui/Icon";
import RightSidebar from "@app/components/tools/RightSidebar";
import { ReaderRail } from "@app/components/viewer/readerRail/ReaderRail";
import Workbench from "@app/components/layout/Workbench";
import FileSidebar from "@app/components/shared/FileSidebar";
import FileManager from "@app/components/FileManager";
import {
  getStartupNavigationAction,
  getDefaultWorkbenchForFileCount,
} from "@app/utils/homePageNavigation";
import { EDITOR_BASENAME } from "@app/routes/editorBasename";
import { READER_PATH } from "@app/routes/readerRoute";
import { rememberSettingsOrigin } from "@app/utils/settingsNavigation";
import { HomePageExtensions } from "@app/components/home/HomePageExtensions";
import { PolicyAutoRunController } from "@app/components/policies/PolicyAutoRunController";
import { usePoliciesEnabled } from "@app/components/policies/usePoliciesEnabled";
import { QuickNavHostBridge } from "@app/components/shared/quickNav/QuickNavHostBridge";
import type { QuickNavToolReasons } from "@app/contexts/QuickNavHostContext";
import {
  getToolDisabledReason,
  getDisabledLabel,
} from "@app/components/tools/fullscreen/shared";
import {
  consumeReaderModeFromPreference,
  consumeReaderModeRequest,
} from "@app/utils/pendingReaderMode";
import {
  FilesPageProvider,
  useFilesPage,
} from "@app/contexts/FilesPageContext";
import { useFolders } from "@app/contexts/FolderContext";
import { folderKind } from "@app/types/folder";
import { useServerFolderBlock } from "@app/hooks/useServerFolderBlock";
import { useNewFolderFlow } from "@app/hooks/useNewFolderFlow";
import { NewFolderButton } from "@app/components/filesPage/NewFolderButton";
import MobileUploadModal from "@app/components/shared/MobileUploadModal";
import { useLibraryRefresh } from "@app/hooks/useLibraryRefresh";
import { useAuth } from "@app/auth/UseSession";
import { canPickDirectory } from "@app/services/directoryPicker";
import { useFileHandler } from "@app/hooks/useFileHandler";
import type { FileSidebarProps } from "@app/components/shared/FileSidebar";

import { Button } from "@app/ui/Button";
import "@app/components/layout/WorkspaceFrame.css";
import "@app/pages/HomePage.css";

const SWIPE_HINT_SEEN_STORAGE_KEY = "stirling.mobileSwipeHintSeen";

/**
 * The wings' slide is `--wings-ms` (dimensions.css). Read from the document so one
 * value drives both, with the literal as the fallback for a test environment that
 * loads no stylesheet, and a frame of headroom so the unmount never clips the
 * last frame of the animation.
 */
const WINGS_FALLBACK_MS = 220;
const WINGS_HEADROOM_MS = 60;

function wingsDurationMs(): number {
  if (typeof window === "undefined") return WINGS_FALLBACK_MS;
  const token = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue("--wings-ms")
    .trim();
  const parsed = Number.parseFloat(token);
  if (!Number.isFinite(parsed) || parsed <= 0) return WINGS_FALLBACK_MS;
  return token.endsWith("ms") ? parsed : parsed * 1000;
}

function readSwipeHintSeen(): boolean {
  try {
    return window.localStorage.getItem(SWIPE_HINT_SEEN_STORAGE_KEY) === "true";
  } catch {
    return true;
  }
}

type MobileView = "tools" | "workbench";

export default function HomePage() {
  const { t } = useTranslation();
  const policiesEnabled = usePoliciesEnabled();
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
  const location = useLocation();

  // Settings is its own page; it restores the recorded origin on Back.
  const openSettings = useCallback(() => {
    rememberSettingsOrigin();
    navigate("/settings");
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
    actions.setWorkbench(getDefaultWorkbenchForFileCount(activeFiles.length));
  }, [handleBackToTools, actions, activeFiles.length]);

  // The library is a view like the viewer and the file editor: which view is on screen
  // is state, the path says which folder you are in. Each side moves the other on a
  // transition only: asserting either on every render lets the path re-impose
  // "myFiles" a render after anything else has set a view.

  // Path moved, so the path is the cause: arrival, back/forward, or a deliberate
  // navigate. Mount included, which is what seeds a deep link.
  const derivedFromPath = actions.viewDerivedFromPathRef;
  useEffect(() => {
    if (derivedFromPath.current === location.pathname) return;
    if (location.pathname.startsWith("/files")) {
      if (navigationState.workbench !== "myFiles") {
        actions.setWorkbench("myFiles");
      }
    } else if (navigationState.workbench === "myFiles") {
      // A restore is reopening a recorded view onto files still loading. Leave the
      // path unmarked so the correction runs once those files land.
      if (isApplyingRestoredView()) return;
      actions.setWorkbench(getDefaultWorkbenchForFileCount(activeFiles.length));
    }
    derivedFromPath.current = location.pathname;
    // Deliberately not keyed on the workbench: this reacts to the path only.
  }, [location.pathname, actions, derivedFromPath, activeFiles.length]);

  // View moved, so the path follows. Pushed, not replaced, so Back leaves the library.
  const wasInLibraryRef = useRef(navigationState.workbench === "myFiles");
  useEffect(() => {
    const inLibrary = navigationState.workbench === "myFiles";
    if (inLibrary === wasInLibraryRef.current) return;
    wasInLibraryRef.current = inLibrary;
    const onFilesPath = location.pathname.startsWith("/files");
    if (inLibrary && !onFilesPath) {
      navigate("/files");
    } else if (!inLibrary && onFilesPath && !readerMode) {
      // Reading also leaves the library, and its own effect names the path it
      // leaves for. Both navigating puts the editor between the two in history,
      // so Back out of reading would land somewhere the user never went.
      navigate(EDITOR_BASENAME);
    }
  }, [navigationState.workbench, location.pathname, navigate, readerMode]);

  // Path moved, so the path is the cause. The ref starts null so mount counts too:
  // that is what makes a reload land back in reading, and what takes you out of it
  // when the library moves the path to its own.
  const readerDerivedFromPath = useRef<string | null>(null);
  useEffect(() => {
    if (readerDerivedFromPath.current === location.pathname) return;
    readerDerivedFromPath.current = location.pathname;
    const onReadPath = location.pathname.startsWith(READER_PATH);
    if (onReadPath !== readerMode) setReaderMode(onReadPath);
  }, [location.pathname, readerMode, setReaderMode]);

  // The wings animate off their own edge, so the unmount waits out the leave rather
  // than happening with it. The rails' stylesheets take them out of flow while it
  // runs, so what is underneath is already in its reading position and nothing
  // reflows twice.
  const [wingsMounted, setWingsMounted] = useState(!readerMode);
  const [wingsPhase, setWingsPhase] = useState<"leaving" | "returning" | null>(
    null,
  );
  const readingRef = useRef(readerMode);
  useEffect(() => {
    if (readingRef.current === readerMode) return;
    readingRef.current = readerMode;
    const slide = wingsDurationMs() + WINGS_HEADROOM_MS;
    if (readerMode) {
      setWingsPhase("leaving");
      const gone = window.setTimeout(() => {
        setWingsPhase(null);
        setWingsMounted(false);
      }, slide);
      return () => window.clearTimeout(gone);
    }
    setWingsMounted(true);
    setWingsPhase("returning");
    const settled = window.setTimeout(() => setWingsPhase(null), slide);
    return () => window.clearTimeout(settled);
  }, [readerMode]);

  // Reading moved, so the path follows. Pushed, not replaced, so Back leaves it.
  const wasReadingRef = useRef(readerMode);
  useEffect(() => {
    if (readerMode === wasReadingRef.current) return;
    wasReadingRef.current = readerMode;
    const onReadPath = location.pathname.startsWith(READER_PATH);
    if (readerMode && !onReadPath) {
      navigate(READER_PATH, {
        replace: consumeReaderModeFromPreference(),
      });
    } else if (!readerMode && onReadPath) {
      navigate(EDITOR_BASENAME);
    }
  }, [readerMode, location.pathname, navigate]);

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

  const openFromComputerRef = useRef<(() => void) | null>(null);
  const registerOpenFromComputer = useCallback((open: (() => void) | null) => {
    openFromComputerRef.current = open;
  }, []);
  const openFromComputer = useCallback(() => {
    openFromComputerRef.current?.();
  }, []);

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

  // Mobile's bottom bar sets no view of its own, so leaving the library is the path
  // moving; the reconciliation effect takes the view with it.
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
      {policiesEnabled && <PolicyAutoRunController />}
      <QuickNavHostBridge
        requestNavigation={requestNavigation}
        readerMode={readerMode}
        fileLibrary={navigationState.workbench === "myFiles"}
        onSetReaderMode={setReaderMode}
        onGoToDefaultState={goToDefaultState}
        onSelectTool={handleToolSelect}
        activeTool={selectedToolKey}
        onShowFileLibrary={() => actions.setWorkbench("myFiles")}
        toolReasons={quickNavToolReasons}
        onOpenFromComputer={
          navigationState.workbench === "myFiles" ? undefined : openFromComputer
        }
      />
      <FilesPageProvider>
        {isMobile ? (
          <div
            className="mobile-layout"
            data-files-mode={navigationState.workbench === "myFiles"}
          >
            {/* The library brings its own tabs and folder path, so the
              tools/workspace toggle would only cost it vertical space. Every
              other view keeps the toggle. */}
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
                <Icon name="layout-grid" size={"1.5rem"} />
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
                  <Icon name="workflow" size="1.5rem" />
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
                <Icon name="folder" size="1.5rem" />
                <span className="mobile-bottom-button-label">
                  {t("quickAccess.files", "Files")}
                </span>
              </Button>
              <Button
                variant="tertiary"
                className="mobile-bottom-button"
                aria-label={t("quickAccess.config", "Config")}
                onClick={openSettings}
              >
                <Icon name="settings" size="1.5rem" />
                <span className="mobile-bottom-button-label">
                  {t("quickAccess.config", "Config")}
                </span>
              </Button>
            </div>
            <FileManager selectedTool={selectedTool} />
          </div>
        ) : (
          <Group
            align="flex-start"
            gap={0}
            h="100%"
            className="flex-nowrap flex"
            bg="var(--c-bg)"
            data-wings={wingsPhase ?? undefined}
          >
            {/* Reading leaves the document and nothing beside it, so the wing goes
                rather than shrinking to a rail. Everywhere else it is fixed open. */}
            {wingsMounted && (
              <div className="workspace-frame">
                <MyFilesAwareFileSidebar
                  ref={quickAccessRef}
                  accountHoisted
                  active={navigationState.workbench === "myFiles"}
                  onOpenSettings={openSettings}
                  onRegisterOpenFromComputer={registerOpenFromComputer}
                />
              </div>
            )}
            <Workbench />
            {/* The reader's rail takes the slot the tool panel holds otherwise: the
                panel's controls are the editor's, and reading wants the viewer's.
                Both render together only while the panel is on its way out. */}
            {wingsMounted && !hideToolPanel && <RightSidebar />}
            {readerMode && <ReaderRail />}
            <FileManager selectedTool={selectedTool} />
          </Group>
        )}
      </FilesPageProvider>
    </div>
  );
}

interface MyFilesAwareFileSidebarProps extends FileSidebarProps {
  active: boolean;
}

/** Wraps FileSidebar with the library's overrides while the library is on screen. */
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
    const { addLocalFolder, createFolderHere, createFolderHereBlockedReason } =
      useNewFolderFlow();
    const { refreshing, refresh: refreshLibrary } = useLibraryRefresh();
    const { isAnonymous } = useAuth();
    const { config: appConfig } = useAppConfig();
    const [mobileUploadOpen, setMobileUploadOpen] = useState(false);
    const isMobileViewport = useIsMobile();
    // The scanner sends files from a phone to this screen, so it is a desktop
    // affordance: on a phone you are already where the files are.
    const mobileUploadAvailable =
      Boolean(appConfig?.enableMobileScanner) && !isMobileViewport;
    const signInRequired = isAnonymous
      ? t("filesPage.signInRequired", "Sign in to use cloud storage.")
      : null;

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

    // Kind-aware: only a server folder's subfolder needs the server, and a mounted
    // directory takes no subfolders from here at all.
    const railCurrentFolder = folders.currentFolderId
      ? folders.foldersById.get(folders.currentFolderId)
      : undefined;
    const railCurrentKind = railCurrentFolder
      ? folderKind(railCurrentFolder)
      : null;
    const serverFolderBlock = useServerFolderBlock();
    const newFolderDisabledReason =
      railCurrentKind === "server"
        ? serverFolderBlock
        : createFolderHereBlockedReason;

    return (
      <>
        <FileSidebar
          ref={ref}
          {...props}
          onUploadFiles={handleUpload}
          onPickGoogleDriveFiles={handleUpload}
          extraActions={[
            {
              icon: <Icon name="folder-plus" />,
              label: t("filesPage.newFolder", "New folder"),
              onClick: createFolderHere,
              disabled: newFolderDisabledReason !== null,
              disabledTooltip: newFolderDisabledReason ?? undefined,
              testId: "files-rail-new-folder",
              // The same control the library's other surfaces use, so one row
              // cannot offer less than another: where a folder can go decides
              // its shape.
              render: () => (
                <NewFolderButton
                  trigger="row"
                  testId="files-rail-new-folder"
                  label={t("filesPage.newFolder", "New folder")}
                  disabledReason={newFolderDisabledReason}
                  serverDisabledReason={serverFolderBlock ?? undefined}
                  currentFolderId={folders.currentFolderId}
                  canAddLocalFolder={canPickDirectory}
                  onAddLocalFolder={() => void addLocalFolder()}
                  onOpenDialog={filesPage.openNewFolderDialog}
                />
              ),
            },
            {
              icon: (
                <Icon
                  name="refresh-cw"
                  className={refreshing ? "file-sidebar-spin" : undefined}
                />
              ),
              label: t("filesPage.refresh", "Refresh from server"),
              onClick: () => void refreshLibrary(),
              disabled: refreshing || signInRequired !== null,
              disabledTooltip: signInRequired ?? undefined,
              testId: "files-rail-refresh",
            },
            ...(mobileUploadAvailable
              ? [
                  {
                    icon: <Icon name="qr-code" />,
                    label: t(
                      "filesPage.uploadFromMobile",
                      "Upload from Mobile",
                    ),
                    onClick: () => setMobileUploadOpen(true),
                    testId: "files-rail-mobile-upload",
                  },
                ]
              : []),
          ]}
        />
        <MobileUploadModal
          opened={mobileUploadOpen}
          onClose={() => setMobileUploadOpen(false)}
          onFilesReceived={(files) => {
            if (files.length > 0) void handleUpload(files);
          }}
        />
      </>
    );
  },
);
