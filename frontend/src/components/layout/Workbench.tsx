import React from 'react';
import { Box } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useRainbowThemeContext } from '../shared/RainbowThemeProvider';
import { useToolWorkflow } from '../../contexts/ToolWorkflowContext';
import { useFileHandler } from '../../hooks/useFileHandler';
import { useFileState, useFileActions } from '../../contexts/FileContext';
import { useNavigationState, useNavigationActions } from '../../contexts/NavigationContext';

import TopControls from '../shared/TopControls';
import FileEditor from '../fileEditor/FileEditor';
import PageEditor from '../pageEditor/PageEditor';
import PageEditorControls from '../pageEditor/PageEditorControls';
import Viewer from '../viewer/Viewer';
import ToolRenderer from '../tools/ToolRenderer';
import LandingPage from '../shared/LandingPage';
import { ToolId } from '../../data/toolsTaxonomy';

// No props needed - component uses contexts directly
export default function Workbench() {
  const { t } = useTranslation();
  const { isRainbowMode } = useRainbowThemeContext();

  // Use context-based hooks to eliminate all prop drilling
  const { state } = useFileState();
  const { actions } = useFileActions();
  const { currentMode: currentView } = useNavigationState();
  const { actions: navActions } = useNavigationActions();
  const setCurrentView = navActions.setMode;
  const activeFiles = state.files.ids;
  const {
    previewFile,
    pageEditorFunctions,
    sidebarsVisible,
    setPreviewFile,
    setPageEditorFunctions,
    setSidebarsVisible
  } = useToolWorkflow();

  const { selectedToolKey, selectedTool, handleToolSelect } = useToolWorkflow();
  const { addToActiveFiles } = useFileHandler();

  const handlePreviewClose = () => {
    setPreviewFile(null);
    const previousMode = sessionStorage.getItem('previousMode');
    if (previousMode === ToolId.SPLIT_PDF) {
      // Use context's handleToolSelect which coordinates tool selection and view changes
      handleToolSelect(ToolId.SPLIT_PDF);
      sessionStorage.removeItem('previousMode');
    } else if (previousMode === ToolId.COMPRESS) {
      handleToolSelect(ToolId.COMPRESS);
      sessionStorage.removeItem('previousMode');
    } else if (previousMode === ToolId.CONVERT) {
      handleToolSelect(ToolId.CONVERT);
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
            toolMode={!!selectedToolKey}
            showUpload={true}
            showBulkActions={!selectedToolKey}
            supportedExtensions={selectedTool?.supportedFormats || ["pdf"]}
            {...(!selectedToolKey && {
              onOpenPageEditor: (file) => {
                setCurrentView("pageEditor");
              },
              onMergeFiles: (filesToMerge) => {
                filesToMerge.forEach(addToActiveFiles);
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
                onExportSelected={pageEditorFunctions.onExportSelected}
                onExportAll={pageEditorFunctions.onExportAll}
                exportLoading={pageEditorFunctions.exportLoading}
                selectionMode={pageEditorFunctions.selectionMode}
                selectedPages={pageEditorFunctions.selectedPages}
              />
            )}
          </>
        );

      default:
        // Check if it's a tool view
        if (selectedToolKey && selectedTool) {
          return (
            <ToolRenderer
              selectedToolKey={selectedToolKey}
            />
          );
        }
        return (
          <LandingPage/>
        );
    }
  };

  return (
    <Box
      className="flex-1 h-screen min-w-80 relative flex flex-col"
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
        selectedToolKey={selectedToolKey}
      />

      {/* Main content area */}
      <Box
        className="flex-1 min-h-0 relative z-10"
        style={{
          transition: 'opacity 0.15s ease-in-out',
        }}
      >
        {renderMainContent()}
      </Box>
    </Box>
  );
}
