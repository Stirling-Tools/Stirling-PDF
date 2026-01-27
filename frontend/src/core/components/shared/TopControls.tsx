import React, { useState, useCallback, useMemo } from "react";
import { SegmentedControl, Loader } from "@mantine/core";
import { useRainbowThemeContext } from '@app/components/shared/RainbowThemeProvider';
import rainbowStyles from '@app/styles/rainbow.module.css';
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import GridViewIcon from "@mui/icons-material/GridView";
import FolderIcon from "@mui/icons-material/Folder";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import { WorkbenchType, isValidWorkbench } from '@app/types/workbench';
import { PageEditorFileDropdown } from '@app/components/shared/PageEditorFileDropdown';
import type { CustomWorkbenchViewInstance } from '@app/contexts/ToolWorkflowContext';
import { FileDropdownMenu } from '@app/components/shared/FileDropdownMenu';
import { usePageEditorDropdownState, PageEditorDropdownState } from '@app/components/pageEditor/hooks/usePageEditorDropdownState';


const viewOptionStyle: React.CSSProperties = {
  display: 'inline-flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: '0.5rem',
  justifyContent: 'center',
  padding: '2px 1rem',
};

// Helper function to create view options for SegmentedControl
const createViewOptions = (
  currentView: WorkbenchType,
  switchingTo: WorkbenchType | null,
  activeFiles: Array<{ fileId: string; name: string; versionNumber?: number }>,
  currentFileIndex: number,
  onFileSelect?: (index: number) => void,
  onFileRemove?: (fileId: string, index: number) => void,
  pageEditorState?: PageEditorDropdownState,
  customViews?: CustomWorkbenchViewInstance[]
) => {
  // Viewer dropdown logic
  const currentFile = activeFiles[currentFileIndex];
  const isInViewer = currentView === 'viewer';
  const fileName = currentFile?.name || '';
  const viewerDisplayName = isInViewer && fileName ? fileName : 'Viewer';
  const hasMultipleFiles = activeFiles.length > 1;
  const showViewerDropdown = isInViewer && hasMultipleFiles;

  const viewerOption = {
    label: showViewerDropdown ? (
      <FileDropdownMenu
        displayName={viewerDisplayName}
        activeFiles={activeFiles}
        currentFileIndex={currentFileIndex}
        onFileSelect={onFileSelect}
        onFileRemove={onFileRemove}
        switchingTo={switchingTo}
        viewOptionStyle={viewOptionStyle}
      />
    ) : (
      <div style={viewOptionStyle}>
        {switchingTo === "viewer" ? (
          <Loader size="sm" />
        ) : (
          <InsertDriveFileIcon fontSize="medium" />
        )}
      </div>
    ),
    value: "viewer",
  };

  // Page Editor dropdown logic
  const isInPageEditor = currentView === 'pageEditor';
  const hasPageEditorFiles = pageEditorState && pageEditorState.totalCount > 0;
  const showPageEditorDropdown = isInPageEditor && hasPageEditorFiles;

  const pageEditorOption = {
    label: showPageEditorDropdown ? (
      <PageEditorFileDropdown
        files={pageEditorState!.files}
        onToggleSelection={pageEditorState!.onToggleSelection}
        onReorder={pageEditorState!.onReorder}
        switchingTo={switchingTo}
        viewOptionStyle={viewOptionStyle}
        fileColorMap={pageEditorState!.fileColorMap}
        selectedCount={pageEditorState!.selectedCount}
        totalCount={pageEditorState!.totalCount}
      />
    ) : (
      <div style={viewOptionStyle}>
        {switchingTo === "pageEditor" ? (
          <Loader size="sm" />
        ) : (
          <GridViewIcon fontSize="medium" />
        )}
      </div>
    ),
    value: "pageEditor",
  };

  const fileEditorOption = {
    label: (
      <div style={viewOptionStyle}>
        {switchingTo === "fileEditor" ? <Loader size="sm" /> : <FolderIcon fontSize="medium" />}
      </div>
    ),
    value: "fileEditor",
  };

  const baseOptions = [
    viewerOption,
    pageEditorOption,
    fileEditorOption,
  ];

  const customOptions = (customViews ?? [])
    .filter((view) => view.data != null)
    .map((view) => ({
      label: (
        <div style={viewOptionStyle as React.CSSProperties}>
          {switchingTo === view.workbenchId ? (
            <Loader size="sm" />
          ) : (
            view.icon || <PictureAsPdfIcon fontSize="medium" />
          )}
          <span>{view.label}</span>
        </div>
      ),
      value: view.workbenchId,
    }));

  return [...baseOptions, ...customOptions];
};

interface TopControlsProps {
  currentView: WorkbenchType;
  setCurrentView: (view: WorkbenchType) => void;
  customViews?: CustomWorkbenchViewInstance[];
  activeFiles?: Array<{ fileId: string; name: string; versionNumber?: number }>;
  currentFileIndex?: number;
  onFileSelect?: (index: number) => void;
  onFileRemove?: (fileId: string, index: number) => void;
}

const TopControls = ({
  currentView,
  setCurrentView,
  customViews = [],
  activeFiles = [],
  currentFileIndex = 0,
  onFileSelect,
  onFileRemove,
}: TopControlsProps) => {
  const { isRainbowMode } = useRainbowThemeContext();
  const [switchingTo, setSwitchingTo] = useState<WorkbenchType | null>(null);

  const pageEditorState = usePageEditorDropdownState();

  const handleViewChange = useCallback((view: string) => {
    if (!isValidWorkbench(view)) {
      return;
    }

    const workbench = view;

    // Show immediate feedback
    setSwitchingTo(workbench);

    // Defer the heavy view change to next frame so spinner can render
    requestAnimationFrame(() => {
      // Give the spinner one more frame to show
      requestAnimationFrame(() => {
        setCurrentView(workbench);

        // Clear the loading state after view change completes
        setTimeout(() => setSwitchingTo(null), 300);
      });
    });
  }, [setCurrentView]);

  // Memoize view options to prevent SegmentedControl re-renders
  const viewOptions = useMemo(() => createViewOptions(
    currentView,
    switchingTo,
    activeFiles,
    currentFileIndex,
    onFileSelect,
    onFileRemove,
    pageEditorState,
    customViews
  ), [currentView, switchingTo, activeFiles, currentFileIndex, onFileSelect, onFileRemove, pageEditorState, customViews]);

  return (
    <div className="absolute left-0 w-full top-0 z-[100] pointer-events-none">
      <div className="flex justify-center">

        <SegmentedControl
          data-tour="view-switcher"
          data={viewOptions}

          value={currentView}
          onChange={handleViewChange}
          color="blue"
          fullWidth
          className={isRainbowMode ? rainbowStyles.rainbowSegmentedControl : ''}
          style={{
            transition: 'all 0.2s ease',
            opacity: switchingTo ? 0.8 : 1,
            pointerEvents: 'auto'
          }}
          styles={{
            root: {
              borderRadius: '0 0 16px 16px',
              height: '1.8rem',
              backgroundColor: 'var(--bg-toolbar)',
              border: '1px solid var(--border-default)',
              borderTop: 'none',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              outline: '1px solid rgba(0, 0, 0, 0.1)',
              outlineOffset: '-1px',
              padding: '0 0',
              gap: '0',
            },
            control: {
              borderRadius: '0 0 16px 16px',
              padding: '0',
              border: 'none',
            },
            indicator: {
              borderRadius: '0 0 16px 16px',
              height: '100%',
              top: '0rem',
              margin: '0',
              border: 'none',
            },
            label: {
              paddingTop: '0',
              paddingBottom: '0',
            }
          }}
        />
      </div>
    </div>
  );
};

export default TopControls;
