import { useCallback, useRef } from 'react';
import { Box } from '@mantine/core';
import { useRainbowThemeContext } from '@app/components/shared/RainbowThemeProvider';
import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';
import { useFileHandler } from '@app/hooks/useFileHandler';
import { useFileState } from '@app/contexts/FileContext';
import { useNavigationState, useNavigationActions, useNavigationGuard } from '@app/contexts/NavigationContext';
import { isBaseWorkbench } from '@app/types/workbench';
import { useViewer } from '@app/contexts/ViewerContext';
import { useAppConfig } from '@app/contexts/AppConfigContext';
import type { FileId } from '@app/types/fileContext';
import { VIEWER_TRANSITION } from '@app/constants/animations';
import { captureElementScreenshot } from '@app/utils/screenshot';
import { useViewerTransition } from '@app/hooks/useViewerTransition';
import styles from '@app/components/layout/Workbench.module.css';

import TopControls from '@app/components/shared/TopControls';
import FileEditor from '@app/components/fileEditor/FileEditor';
import PageEditor from '@app/components/pageEditor/PageEditor';
import PageEditorControls from '@app/components/pageEditor/PageEditorControls';
import Viewer from '@app/components/viewer/Viewer';
import LandingPage from '@app/components/shared/LandingPage';
import Footer from '@app/components/shared/Footer';
import DismissAllErrorsButton from '@app/components/shared/DismissAllErrorsButton';
import { ViewerZoomTransition } from '@app/components/viewer/ViewerZoomTransition';

// No props needed - component uses contexts directly
export default function Workbench() {
  const { isRainbowMode } = useRainbowThemeContext();
  const { config } = useAppConfig();

  // Use context-based hooks to eliminate all prop drilling
  const { selectors } = useFileState();
  const { workbench: currentView, viewerTransition } = useNavigationState();
  const { actions: navActions } = useNavigationActions();
  const activeFiles = selectors.getFiles();

  // Ref for capturing screenshot during TopControls transitions
  const mainContentRef = useRef<HTMLDivElement>(null);
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

  // Get active file index from ViewerContext
  const { activeFileIndex, setActiveFileIndex } = useViewer();
  
  // Get navigation guard for unsaved changes check when switching files
  const { requestNavigation } = useNavigationGuard();

  // Wrap file selection to check for unsaved changes before switching
  // requestNavigation will show the modal if there are unsaved changes, otherwise navigate immediately
  const handleFileSelect = useCallback((index: number) => {
    // Don't do anything if selecting the same file
    if (index === activeFileIndex) return;
    
    // requestNavigation handles the unsaved changes check internally
    requestNavigation(() => {
      setActiveFileIndex(index);
    });
  }, [activeFileIndex, requestNavigation, setActiveFileIndex]);

  const handlePreviewClose = () => {
    setPreviewFile(null);
    const previousMode = sessionStorage.getItem('previousMode');
    if (previousMode === 'split') {
      // Use context's handleToolSelect which coordinates tool selection and view changes
      handleToolSelect('split');
      sessionStorage.removeItem('previousMode');
    } else if (previousMode === 'compress') {
      handleToolSelect('compress');
      sessionStorage.removeItem('previousMode');
    } else if (previousMode === 'convert') {
      handleToolSelect('convert');
      sessionStorage.removeItem('previousMode');
    } else {
      navActions.setWorkbench('fileEditor');
    }
  };

  // Capture screenshot helper for TopControls transitions
  const captureMainContentScreenshot = useCallback(async (): Promise<string | null> => {
    if (!mainContentRef.current) return null;
    return captureElementScreenshot(mainContentRef.current);
  }, []);

  // Get transition handlers
  const { handleEntryTransition, handleExitTransition } = useViewerTransition({
    activeFileIndex,
    currentView,
    captureScreenshot: captureMainContentScreenshot,
  });

  // Wrapper for setCurrentView that adds transition when switching to/from viewer
  const setCurrentView = useCallback(async (view: typeof currentView, fileId?: FileId, sourceRect?: DOMRect) => {
    // Handle entry transition (fileEditor/pageEditor → viewer)
    if (view === 'viewer' && (currentView === 'fileEditor' || currentView === 'pageEditor')) {
      await handleEntryTransition(fileId, sourceRect);
    }

    // Handle exit transition (viewer → fileEditor/pageEditor)
    if ((view === 'fileEditor' || view === 'pageEditor') && currentView === 'viewer') {
      handleExitTransition();
    }

    navActions.setWorkbench(view);
  }, [currentView, navActions, handleEntryTransition, handleExitTransition]);

  const renderMainContent = () => {
    // During viewer transition with screenshot, show screenshot overlay
    if (viewerTransition.isAnimating && viewerTransition.editorScreenshotUrl) {
      const viewerContent = (
        <Viewer
          sidebarsVisible={sidebarsVisible}
          setSidebarsVisible={setSidebarsVisible}
          previewFile={previewFile}
          onClose={handlePreviewClose}
          activeFileIndex={activeFileIndex}
          setActiveFileIndex={setActiveFileIndex}
        />
      );

      // Screenshot fades out when zoom starts
      const screenshotOverlay = (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: window.innerWidth,
            height: window.innerHeight,
            opacity: viewerTransition.isZooming ? 0 : 1,
            transition: viewerTransition.isZooming
              ? `opacity ${VIEWER_TRANSITION.SCREENSHOT_FADE_DURATION}ms ease-out`
              : 'none',
            pointerEvents: 'none',
          }}
        >
          <img
            src={viewerTransition.editorScreenshotUrl}
            alt="Loading..."
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'fill',
              display: 'block',
            }}
          />
        </div>
      );

      return (
        <>
          {viewerContent}
          {screenshotOverlay}
        </>
      );
    }

    // Check for custom workbench views first
    if (!isBaseWorkbench(currentView)) {
      const customView = customWorkbenchViews.find((view) => view.workbenchId === currentView && view.data != null);
      if (customView) {
        // PDF text editor handles its own empty state (shows dropzone when no document)
        const handlesOwnEmptyState = currentView === 'custom:pdfTextEditor';
        if (handlesOwnEmptyState || activeFiles.length > 0) {
          const CustomComponent = customView.component;
          return <CustomComponent data={customView.data} />;
        }
      }
    }

    // For base workbenches (or custom views that don't handle empty state), show landing page when no files
    if (activeFiles.length === 0) {
      return (
        <LandingPage
        />
      );
    }

    switch (currentView) {
      case "fileEditor":

        return (
          <FileEditor
            toolMode={!!selectedToolId}
            supportedExtensions={selectedTool?.supportedFormats || ["pdf"]}
            onOpenViewer={(fileId, sourceRect) => {
              setCurrentView("viewer", fileId, sourceRect);
            }}
          />
        );

      case "viewer":
        
        return (
          <Viewer
            sidebarsVisible={sidebarsVisible}
            setSidebarsVisible={setSidebarsVisible}
            previewFile={previewFile}
            onClose={handlePreviewClose}
            activeFileIndex={activeFileIndex}
            setActiveFileIndex={setActiveFileIndex}
          />
        );

      case "pageEditor":
        
        return (
          <>
            <PageEditor
              onFunctionsReady={setPageEditorFunctions}
            />
            {pageEditorFunctions && (
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
            )}
          </>
        );

      default:
        return <LandingPage />;
    }
  };

  return (
    <Box
      className="flex-1 h-full min-w-0 relative flex flex-col"
      data-tour="workbench"
      style={
        isRainbowMode
          ? {} // No background color in rainbow mode
          : { backgroundColor: 'var(--bg-background)' }
      }
    >
      {/* Top Controls */}
      {activeFiles.length > 0 && (
        <TopControls
          currentView={currentView}
          setCurrentView={setCurrentView}
          customViews={customWorkbenchViews}
          activeFiles={activeFiles.map(f => {
            const stub = selectors.getStirlingFileStub(f.fileId);
            return { fileId: f.fileId, name: f.name, versionNumber: stub?.versionNumber };
          })}
          currentFileIndex={activeFileIndex}
          onFileSelect={handleFileSelect}
        />
      )}

      {/* Dismiss All Errors Button */}
      <DismissAllErrorsButton />

      {/* Main content area */}
      <Box
        ref={mainContentRef}
        className={`flex-1 min-h-0 relative z-10 ${styles.workbenchScrollable}`}
        style={{
          transition: 'opacity 0.15s ease-in-out',
        }}
      >
{renderMainContent()}
      </Box>

      {/* Viewer Zoom Transition Overlay */}
      <ViewerZoomTransition />

      <Box style={{ position: 'relative', zIndex: 100 }}>
        <Footer
          analyticsEnabled={config?.enableAnalytics === true}
          termsAndConditions={config?.termsAndConditions}
          privacyPolicy={config?.privacyPolicy}
          cookiePolicy={config?.cookiePolicy}
          impressum={config?.impressum}
          accessibilityStatement={config?.accessibilityStatement}
        />
      </Box>
    </Box>
  );
}
