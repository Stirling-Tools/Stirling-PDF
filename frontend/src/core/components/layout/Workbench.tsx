import { useCallback } from 'react';
import { Box } from '@mantine/core';
import { useRainbowThemeContext } from '@app/components/shared/RainbowThemeProvider';
import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';
import { useFileHandler } from '@app/hooks/useFileHandler';
import { useFileState } from '@app/contexts/FileContext';
import { useNavigationState, useNavigationActions, useNavigationGuard } from '@app/contexts/NavigationContext';
import { isBaseWorkbench } from '@app/types/workbench';
import { useViewer } from '@app/contexts/ViewerContext';
import { useAppConfig } from '@app/contexts/AppConfigContext';
import styles from '@app/components/layout/Workbench.module.css';

import TopControls from '@app/components/shared/TopControls';
import FileEditor from '@app/components/fileEditor/FileEditor';
import PageEditor from '@app/components/pageEditor/PageEditor';
import PageEditorControls from '@app/components/pageEditor/PageEditorControls';
import Viewer from '@app/components/viewer/Viewer';
import LandingPage from '@app/components/shared/LandingPage';
import Footer from '@app/components/shared/Footer';
import DismissAllErrorsButton from '@app/components/shared/DismissAllErrorsButton';

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
      setCurrentView('fileEditor');
    }
  };

  const renderMainContent = () => {
    // Check if we're showing a custom workbench first
    // Custom workbenches may not require files in FileContext (e.g., sign request workbench)
    if (!isBaseWorkbench(currentView)) {
      const customView = customWorkbenchViews.find((view) => view.workbenchId === currentView && view.data != null);
      if (customView) {
        const CustomComponent = customView.component;
        return <CustomComponent data={customView.data} />;
      }
    }

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
            {...(!selectedToolId && {
              onOpenPageEditor: () => {
                setCurrentView("pageEditor");
              },
              onMergeFiles: (filesToMerge) => {
                addFiles(filesToMerge);
                setCurrentView("viewer");
              }
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
        className={`flex-1 min-h-0 relative z-10 ${styles.workbenchScrollable}`}
        style={{
          transition: 'opacity 0.15s ease-in-out',
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
