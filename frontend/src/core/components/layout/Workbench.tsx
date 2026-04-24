import { Box } from "@mantine/core";
import { useRainbowThemeContext } from "@app/components/shared/RainbowThemeProvider";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { useFileHandler } from "@app/hooks/useFileHandler";
import { useFileState } from "@app/contexts/FileContext";
import {
  useNavigationState,
  useNavigationActions,
} from "@app/contexts/NavigationContext";
import { isBaseWorkbench } from "@app/types/workbench";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import styles from "@app/components/layout/Workbench.module.css";

import WorkbenchBar from "@app/components/shared/WorkbenchBar";
import FileEditor from "@app/components/fileEditor/FileEditor";
import PageEditor from "@app/components/pageEditor/PageEditor";
import PageEditorControls from "@app/components/pageEditor/PageEditorControls";
import Viewer from "@app/components/viewer/Viewer";
import Footer from "@app/components/shared/Footer";
import DismissAllErrorsButton from "@app/components/shared/DismissAllErrorsButton";
import LandingPage from "@app/components/shared/LandingPage";

// No props needed - component uses contexts directly
export default function Workbench() {
  const { isRainbowMode } = useRainbowThemeContext();
  const { config } = useAppConfig();

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

  // Get navigation state - this is the source of truth
  const { selectedTool: selectedToolId } = useNavigationState();

  // Get tool registry from context (instead of direct hook call)
  const { toolRegistry } = useToolWorkflow();
  const selectedTool = selectedToolId ? toolRegistry[selectedToolId] : null;
  const { addFiles } = useFileHandler();

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

    if (activeFiles.length === 0) {
      return <LandingPage />;
    }

    switch (currentView) {
      case "fileEditor":
        return (
          <FileEditor
            toolMode={!!selectedToolId}
            supportedExtensions={selectedTool?.supportedFormats || ["pdf"]}
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
      style={
        isRainbowMode
          ? {} // No background color in rainbow mode
          : { backgroundColor: "var(--bg-background)" }
      }
    >
      {/* Workbench Bar - replaces TopControls and includes RightRail action buttons */}
      {!customWorkbenchViews.find((v) => v.workbenchId === currentView)
        ?.hideTopControls && (
        <WorkbenchBar
          currentView={currentView}
          setCurrentView={setCurrentView}
          hasFiles={activeFiles.length > 0}
        />
      )}

      {/* Dismiss All Errors Button */}
      <DismissAllErrorsButton />

      {/* Main content area */}
      <Box
        className={`flex-1 min-h-0 z-10 ${currentView === "pageEditor" ? "relative flex flex-col" : `relative ${styles.workbenchScrollable}`}`}
        style={{
          transition: "opacity 0.15s ease-in-out",
          ...(currentView === "pageEditor" && { height: 0 }),
        }}
      >
        {renderMainContent()}
      </Box>

      <Footer
        analyticsEnabled={config?.enableAnalytics === true}
        termsAndConditions={config?.termsAndConditions}
        privacyPolicy={config?.privacyPolicy}
        cookiePolicy={config?.cookiePolicy}
        impressum={config?.impressum}
        accessibilityStatement={config?.accessibilityStatement}
      />
    </Box>
  );
}
