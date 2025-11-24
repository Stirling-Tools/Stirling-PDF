import { Box } from '@mantine/core';
import { useEffect, useRef, useState } from 'react';
import { useRainbowThemeContext } from '@app/components/shared/RainbowThemeProvider';
import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';
import { useFileHandler } from '@app/hooks/useFileHandler';
import { useFileState } from '@app/contexts/FileContext';
import { useNavigationState, useNavigationActions } from '@app/contexts/NavigationContext';
import { BaseWorkbenchType, isBaseWorkbench } from '@app/types/workbench';
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

type TransitionEffect = 'zoomIn' | 'zoomOut' | 'fade';

const BASE_SCOPE_LEVELS: Record<BaseWorkbenchType, number> = {
  fileEditor: 0,
  pageEditor: 1,
  viewer: 2,
};

// No props needed - component uses contexts directly
export default function Workbench() {
  const { isRainbowMode } = useRainbowThemeContext();
  const { config } = useAppConfig();

  // Use context-based hooks to eliminate all prop drilling
  const { selectors } = useFileState();
  const { workbench: currentView } = useNavigationState();
  const { actions: navActions } = useNavigationActions();
  const setCurrentView = navActions.setWorkbench;

  const previousViewRef = useRef(currentView);
  const [transitionEffect, setTransitionEffect] = useState<TransitionEffect | null>(null);
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

  useEffect(() => {
    const previousView = previousViewRef.current;

    if (previousView === currentView) {
      return;
    }

    const previousLevel = BASE_SCOPE_LEVELS[previousView as BaseWorkbenchType] ?? -1;
    const nextLevel = BASE_SCOPE_LEVELS[currentView as BaseWorkbenchType] ?? -1;

    let effect: TransitionEffect = 'fade';

    if (previousLevel !== -1 && nextLevel !== -1) {
      if (previousLevel > nextLevel) {
        effect = 'zoomOut';
      } else if (previousLevel < nextLevel) {
        effect = 'zoomIn';
      }
    }

    setTransitionEffect(effect);
    previousViewRef.current = currentView;

    const timeout = setTimeout(() => setTransitionEffect(null), 480);

    return () => clearTimeout(timeout);
  }, [currentView]);

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

  const transitionClassName = transitionEffect ? styles[transitionEffect] : '';

  const renderMainContent = () => {
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
        if (!isBaseWorkbench(currentView)) {
          const customView = customWorkbenchViews.find((view) => view.workbenchId === currentView && view.data != null);
            
          
          if (customView) {
            const CustomComponent = customView.component;
            return <CustomComponent data={customView.data} />;
          }
        }
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
          onFileSelect={setActiveFileIndex}
        />
      )}

      {/* Dismiss All Errors Button */}
      <DismissAllErrorsButton />

      {/* Main content area */}
      <Box
        className={`flex-1 min-h-0 relative z-10 ${styles.workbenchScrollable} ${styles.workbenchTransition} ${transitionClassName}`}
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
