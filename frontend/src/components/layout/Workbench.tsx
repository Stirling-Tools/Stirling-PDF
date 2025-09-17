import { Box } from '@mantine/core';
import { useRainbowThemeContext } from '../shared/RainbowThemeProvider';
import { useToolWorkflow } from '../../contexts/ToolWorkflowContext';
import { useFileHandler } from '../../hooks/useFileHandler';
import { useFileState } from '../../contexts/FileContext';
import { useNavigationState, useNavigationActions } from '../../contexts/NavigationContext';
import { useToolManagement } from '../../hooks/useToolManagement';
import './Workbench.css';

import TopControls from '../shared/TopControls';
import FileEditor from '../fileEditor/FileEditor';
import PageEditor from '../pageEditor/PageEditor';
import PageEditorControls from '../pageEditor/PageEditorControls';
import Viewer from '../viewer/Viewer';
import LandingPage from '../shared/LandingPage';
import Footer from '../shared/Footer';

// No props needed - component uses contexts directly
export default function Workbench() {
  const { isRainbowMode } = useRainbowThemeContext();

  // Use context-based hooks to eliminate all prop drilling
  const { state } = useFileState();
  const { workbench: currentView } = useNavigationState();
  const { actions: navActions } = useNavigationActions();
  const setCurrentView = navActions.setWorkbench;
  const activeFiles = state.files.ids;
  const {
    previewFile,
    pageEditorFunctions,
    sidebarsVisible,
    setPreviewFile,
    setPageEditorFunctions,
    setSidebarsVisible
  } = useToolWorkflow();

  const { handleToolSelect } = useToolWorkflow();

  // Get navigation state - this is the source of truth
  const { selectedTool: selectedToolId } = useNavigationState();

  // Get tool registry to look up selected tool
  const { toolRegistry } = useToolManagement();
  const selectedTool = selectedToolId ? toolRegistry[selectedToolId] : null;
  const { addFiles } = useFileHandler();

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
        return (
          <LandingPage/>
        );
    }
  };

  return (
    <Box
      className="flex-1 h-full min-w-80 relative flex flex-col"
      style={
        isRainbowMode
          ? {} // No background color in rainbow mode
          : { backgroundColor: 'var(--bg-background)' }
      }
    >
      {/* Top Controls */}
      <TopControls
        currentView={currentView}
        setCurrentView={setCurrentView}
        selectedToolKey={selectedToolId}
      />

      {/* Main content area */}
      <Box
        className="flex-1 min-h-0 relative z-10 workbench-scrollable "
        style={{
          transition: 'opacity 0.15s ease-in-out',
          marginTop: '1rem',
        }}
      >
        {renderMainContent()}
      </Box>

      <Footer analyticsEnabled />
    </Box>
  );
}
