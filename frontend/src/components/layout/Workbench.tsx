import React from 'react';
import { Box } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useRainbowThemeContext } from '../shared/RainbowThemeProvider';
import { ToolConfiguration } from '../../types/tool';
import { PageEditorFunctions } from '../../types/pageEditor';

import TopControls from '../shared/TopControls';
import FileEditor from '../fileEditor/FileEditor';
import PageEditor from '../pageEditor/PageEditor';
import PageEditorControls from '../pageEditor/PageEditorControls';
import Viewer from '../viewer/Viewer';
import ToolRenderer from '../tools/ToolRenderer';
import LandingPage from '../shared/LandingPage';

interface WorkbenchProps {
  /** Currently active files */
  activeFiles: File[];
  /** Current view mode */
  currentView: string;
  /** Currently selected tool key */
  selectedToolKey: string | null;
  /** Selected tool configuration */
  selectedTool: ToolConfiguration | null;
  /** Whether sidebars are visible */
  sidebarsVisible: boolean;
  /** Function to set sidebars visibility */
  setSidebarsVisible: (visible: boolean) => void;
  /** File to preview */
  previewFile: File | null;
  /** Function to clear preview file */
  setPreviewFile: (file: File | null) => void;
  /** Page editor functions */
  pageEditorFunctions: PageEditorFunctions | null;
  /** Function to set page editor functions */
  setPageEditorFunctions: (functions: PageEditorFunctions | null) => void;
  /** Handler for view changes */
  onViewChange: (view: string) => void;
  /** Handler for tool selection */
  onToolSelect: (toolId: string) => void;
  /** Handler for setting left panel view */
  onSetLeftPanelView: (view: 'toolPicker' | 'toolContent') => void;
  /** Handler for adding files to active files */
  onAddToActiveFiles: (file: File) => void;
}

export default function Workbench({
  activeFiles,
  currentView,
  selectedToolKey,
  selectedTool,
  sidebarsVisible,
  setSidebarsVisible,
  previewFile,
  setPreviewFile,
  pageEditorFunctions,
  setPageEditorFunctions,
  onViewChange,
  onToolSelect,
  onSetLeftPanelView,
  onAddToActiveFiles
}: WorkbenchProps) {
  const { t } = useTranslation();
  const { isRainbowMode } = useRainbowThemeContext();

  const handlePreviewClose = () => {
    setPreviewFile(null);
    const previousMode = sessionStorage.getItem('previousMode');
    if (previousMode === 'split') {
      onToolSelect('split');
      onViewChange('split');
      onSetLeftPanelView('toolContent');
      sessionStorage.removeItem('previousMode');
    } else if (previousMode === 'compress') {
      onToolSelect('compress');
      onViewChange('compress');
      onSetLeftPanelView('toolContent');
      sessionStorage.removeItem('previousMode');
    } else if (previousMode === 'convert') {
      onToolSelect('convert');
      onViewChange('convert');
      onSetLeftPanelView('toolContent');
      sessionStorage.removeItem('previousMode');
    } else {
      onViewChange('fileEditor');
    }
  };

  const renderMainContent = () => {
    if (!activeFiles[0]) {
      return (
        <LandingPage
          title={currentView === "viewer"
            ? t("fileUpload.selectPdfToView", "Select a PDF to view")
            : t("fileUpload.selectPdfToEdit", "Select a PDF to edit")
          }
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
                onViewChange("pageEditor");
              },
              onMergeFiles: (filesToMerge) => {
                filesToMerge.forEach(onAddToActiveFiles);
                onViewChange("viewer");
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
            {...(previewFile && {
              onClose: handlePreviewClose
            })}
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
          <LandingPage 
            title="File Management" 
          />
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
        setCurrentView={onViewChange}
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