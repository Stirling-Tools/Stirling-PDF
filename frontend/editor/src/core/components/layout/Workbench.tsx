import { useEffect, useState, Suspense, lazy } from "react";
import { Box, Loader, Center } from "@mantine/core";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { useFileHandler } from "@app/hooks/useFileHandler";
import { useFileState } from "@app/contexts/FileContext";
import {
  useNavigationState,
  useNavigationActions,
} from "@app/contexts/NavigationContext";
import { isBaseWorkbench } from "@app/types/workbench";
import { VIEWER_SUPPORTED_EXTENSIONS } from "@app/utils/fileUtils";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { useSigningOverlay } from "@app/contexts/SigningOverlayContext";
import { useCookieConsent } from "@app/hooks/useCookieConsent";
import styles from "@app/components/layout/Workbench.module.css";

import WorkbenchBar from "@app/components/shared/WorkbenchBar";
import LandingPage from "@app/components/shared/LandingPage";
import DismissAllErrorsButton from "@app/components/shared/DismissAllErrorsButton";
import { ChatFAB } from "@app/components/chat/ChatFAB";

// Workbench panels are loaded on demand. Viewer pulls in pdfjs-dist and the
// full @embedpdf plugin set; FileEditor/PageEditor are only needed once a file
// is open. Lazy-loading keeps all of that out of the initial bundle.
const FileEditor = lazy(() => import("@app/components/fileEditor/FileEditor"));
const PageEditor = lazy(() => import("@app/components/pageEditor/PageEditor"));
const PageEditorControls = lazy(
  () => import("@app/components/pageEditor/PageEditorControls"),
);
const Viewer = lazy(() => import("@app/components/viewer/Viewer"));
const FileManagerView = lazy(
  () => import("@app/components/filesPage/FileManagerView"),
);

// No props needed - component uses contexts directly
export default function Workbench() {
  const { config } = useAppConfig();

  // The consent banner used to be initialised by the footer; the legal links
  // now live in Settings → Legal, so the workbench owns the banner lifecycle.
  useCookieConsent({ analyticsEnabled: config?.enableAnalytics === true });

  // Use context-based hooks to eliminate all prop drilling
  const { selectors } = useFileState();
  const { workbench: currentView } = useNavigationState();
  const { actions: navActions } = useNavigationActions();
  const setCurrentView = navActions.setWorkbench;
  const activeFiles = selectors.getFiles();
  const {
    previewFile,
    pageEditorFunctions,
    sidebarsVisible,
    setPreviewFile,
    setPageEditorFunctions,
    setSidebarsVisible,
    customWorkbenchViews,
  } = useToolWorkflow();

  const { handleToolSelect } = useToolWorkflow();
  const { overlay: signingOverlay } = useSigningOverlay();

  // Get navigation state - this is the source of truth
  const { selectedTool: selectedToolId } = useNavigationState();

  // Get tool registry from context (instead of direct hook call)
  const { toolRegistry } = useToolWorkflow();
  const selectedTool = selectedToolId ? toolRegistry[selectedToolId] : null;
  const { addFiles } = useFileHandler();
  const hasFiles = activeFiles.length > 0;
  // Custom workbench views (e.g. Watched Folders) manage their own content and may
  // have no workbench files, but still need the bar's view switcher so users can
  // navigate back out.
  const isCustomViewActive = !isBaseWorkbench(currentView);

  // Enable bar transitions after first paint so the initial hidden state shows
  // without animating (landing page on load shouldn't animate the bar up).
  const [barTransitionEnabled, setBarTransitionEnabled] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setBarTransitionEnabled(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const handlePreviewClose = () => {
    setPreviewFile(null);
    const previousMode = sessionStorage.getItem("previousMode");
    if (previousMode === "split") {
      // Use context's handleToolSelect which coordinates tool selection and view changes
      handleToolSelect("split");
      sessionStorage.removeItem("previousMode");
    } else if (previousMode === "compress") {
      handleToolSelect("compress");
      sessionStorage.removeItem("previousMode");
    } else if (previousMode === "convert") {
      handleToolSelect("convert");
      sessionStorage.removeItem("previousMode");
    } else {
      setCurrentView("fileEditor");
    }
  };

  const renderMainContent = () => {
    // Check if we're showing a custom workbench first
    // Custom workbenches may not require files in FileContext (e.g., sign request workbench)
    if (!isBaseWorkbench(currentView)) {
      const customView = customWorkbenchViews.find(
        (view) => view.workbenchId === currentView && view.data != null,
      );
      if (customView) {
        const CustomComponent = customView.component;
        return <CustomComponent data={customView.data} />;
      }
    }

    // The "My Files" workbench is available regardless of whether files are
    // currently loaded into the workbench - it lives on top of the IDB store.
    if (currentView === "myFiles") {
      return <FileManagerView />;
    }

    // Shared Signing drives the main viewer from the sidebar (document + overlays
    // via context), ahead of the empty-state landing page.
    if (currentView === "viewer" && signingOverlay?.file) {
      return (
        <Viewer
          sidebarsVisible={sidebarsVisible}
          setSidebarsVisible={setSidebarsVisible}
          previewFile={signingOverlay.file}
          signaturePreviews={signingOverlay.signaturePreviews}
          signaturePreviewsReadOnly={signingOverlay.signaturePreviewsReadOnly}
          signaturePlacementMode={signingOverlay.signaturePlacementMode}
          signaturePlacementData={signingOverlay.signaturePlacementData}
          signaturePlacementType={signingOverlay.signaturePlacementType}
          onSignaturePreviewsChange={signingOverlay.onSignaturePreviewsChange}
          signatureOverlayApiRef={signingOverlay.signatureOverlayApiRef}
        />
      );
    }

    if (activeFiles.length === 0) {
      return <LandingPage />;
    }

    switch (currentView) {
      case "fileEditor":
        return (
          <FileEditor
            toolMode={!!selectedToolId}
            supportedExtensions={
              selectedTool?.supportedFormats || VIEWER_SUPPORTED_EXTENSIONS
            }
            {...(!selectedToolId && {
              onOpenPageEditor: () => {
                setCurrentView("pageEditor");
              },
              onMergeFiles: (filesToMerge) => {
                addFiles(filesToMerge);
                setCurrentView("viewer");
              },
            })}
          />
        );

      case "viewer":
        return (
          <Viewer
            sidebarsVisible={sidebarsVisible}
            setSidebarsVisible={setSidebarsVisible}
            previewFile={previewFile}
            onClose={handlePreviewClose}
          />
        );

      case "pageEditor":
        return (
          <div style={{ position: "relative", flex: "1 1 0", height: 0 }}>
            <PageEditor onFunctionsReady={setPageEditorFunctions} />
            {pageEditorFunctions && (
              <div
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  zIndex: 100,
                }}
              >
                <PageEditorControls
                  onClosePdf={pageEditorFunctions.closePdf}
                  onUndo={pageEditorFunctions.handleUndo}
                  onRedo={pageEditorFunctions.handleRedo}
                  canUndo={pageEditorFunctions.canUndo}
                  canRedo={pageEditorFunctions.canRedo}
                  onRotate={pageEditorFunctions.handleRotate}
                  onDelete={pageEditorFunctions.handleDelete}
                  onSplit={pageEditorFunctions.handleSplit}
                  onSplitAll={pageEditorFunctions.handleSplitAll}
                  onPageBreak={pageEditorFunctions.handlePageBreak}
                  onPageBreakAll={pageEditorFunctions.handlePageBreakAll}
                  onExportAll={pageEditorFunctions.onExportAll}
                  exportLoading={pageEditorFunctions.exportLoading}
                  selectionMode={pageEditorFunctions.selectionMode}
                  selectedPageIds={pageEditorFunctions.selectedPageIds}
                  displayDocument={pageEditorFunctions.displayDocument}
                  splitPositions={pageEditorFunctions.splitPositions}
                  totalPages={pageEditorFunctions.totalPages}
                />
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Box
      className="flex-1 h-full min-w-0 relative flex flex-col"
      data-tour="workbench"
      style={{ backgroundColor: "var(--bg-background)", minWidth: 0 }}
    >
      {/* Workbench Bar - animates in/out based on file presence */}
      {currentView !== "myFiles" &&
        !customWorkbenchViews.find((v) => v.workbenchId === currentView)
          ?.hideTopControls && (
          <div
            className={styles.workbenchBarWrapper}
            data-hidden={String(!hasFiles && !isCustomViewActive)}
            data-no-transition={String(!barTransitionEnabled)}
          >
            <div className={styles.workbenchBarInner}>
              <WorkbenchBar
                currentView={currentView}
                setCurrentView={setCurrentView}
                hasFiles={hasFiles}
              />
            </div>
          </div>
        )}

      {/* Dismiss All Errors Button */}
      <DismissAllErrorsButton />

      {/* Floating AI chat button + panel */}
      <ChatFAB />

      {/* Main content area */}
      <Box
        className={`flex-1 min-h-0 z-10 ${currentView === "pageEditor" ? "relative flex flex-col" : `relative ${styles.workbenchScrollable}`}`}
        style={{
          transition: "opacity 0.15s ease-in-out",
          // Force min-width:0 so flex children (notably the files page
          // toolbar with its 5 bulk-action buttons + 2 selects + view
          // toggle) can shrink below their intrinsic content size on
          // narrow viewports instead of overflowing horizontally.
          minWidth: 0,
          ...(currentView === "pageEditor" && { height: 0 }),
        }}
      >
        <Suspense
          fallback={
            <Center style={{ height: "100%" }}>
              <Loader />
            </Center>
          }
        >
          {renderMainContent()}
        </Suspense>
      </Box>
    </Box>
  );
}
