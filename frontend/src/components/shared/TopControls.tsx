import React, { useState, useCallback, useMemo } from "react";
// Component to sync PageEditorContext with FileContext
// Must be inside PageEditorProvider to access usePageEditor
import { SegmentedControl, Loader } from "@mantine/core";
import { useRainbowThemeContext } from "./RainbowThemeProvider";
import rainbowStyles from '../../styles/rainbow.module.css';
import VisibilityIcon from "@mui/icons-material/Visibility";
import EditNoteIcon from "@mui/icons-material/EditNote";
import FolderIcon from "@mui/icons-material/Folder";
import { WorkbenchType, isValidWorkbench } from '../../types/workbench';
import { FileDropdownMenu } from './FileDropdownMenu';
import { PageEditorFileDropdown } from './PageEditorFileDropdown';
import { usePageEditor } from '../../contexts/PageEditorContext';
import { FileId } from '../../types/file';


const viewOptionStyle: React.CSSProperties = {
  display: 'inline-flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: 6,
  whiteSpace: 'nowrap',
  paddingTop: '0.3rem',
};


// Build view options showing text always
const createViewOptions = (
  currentView: WorkbenchType,
  switchingTo: WorkbenchType | null,
  activeFiles: Array<{ fileId: string | FileId; name: string; versionNumber?: number }>,
  currentFileIndex: number,
  onFileSelect?: (index: number) => void,
  pageEditorState?: {
    files: Array<{ fileId: FileId; name: string; versionNumber?: number; isSelected: boolean }>;
    selectedCount: number;
    totalCount: number;
    onToggleSelection: (fileId: FileId) => void;
    onReorder: (fromIndex: number, toIndex: number) => void;
    fileColorMap: Map<string, number>;
  }
) => {
  const currentFile = activeFiles[currentFileIndex];
  const isInViewer = currentView === 'viewer';
  const fileName = currentFile?.name || '';
  const displayName = isInViewer && fileName ? fileName : 'Viewer';
  const hasMultipleFiles = activeFiles.length > 1;
  const showDropdown = isInViewer && hasMultipleFiles;

  const viewerOption = {
    label: showDropdown ? (
      <FileDropdownMenu
        displayName={displayName}
        activeFiles={activeFiles}
        currentFileIndex={currentFileIndex}
        onFileSelect={onFileSelect}
        switchingTo={switchingTo}
        viewOptionStyle={viewOptionStyle}
      />
    ) : (
      <div style={viewOptionStyle}>
        {switchingTo === "viewer" ? (
          <Loader size="xs" />
        ) : (
          <VisibilityIcon fontSize="small" />
        )}
        <span>{displayName}</span>
      </div>
    ),
    value: "viewer",
  };

  // Page Editor dropdown logic
  const isInPageEditor = currentView === 'pageEditor';
  const hasPageEditorFiles = pageEditorState && pageEditorState.totalCount > 0;
  const showPageEditorDropdown = isInPageEditor && hasPageEditorFiles;

  let pageEditorDisplayName = 'Page Editor';
  if (isInPageEditor && pageEditorState) {
    pageEditorDisplayName = `${pageEditorState.selectedCount}/${pageEditorState.totalCount} selected`;
  }

  const pageEditorOption = {
    label: showPageEditorDropdown ? (
      <PageEditorFileDropdown
        displayName={pageEditorDisplayName}
        files={pageEditorState!.files}
        onToggleSelection={pageEditorState!.onToggleSelection}
        onReorder={pageEditorState!.onReorder}
        switchingTo={switchingTo}
        viewOptionStyle={viewOptionStyle}
        fileColorMap={pageEditorState!.fileColorMap}
      />
    ) : (
      <div style={viewOptionStyle}>
        {switchingTo === "pageEditor" ? (
          <Loader size="xs" />
        ) : (
          <EditNoteIcon fontSize="small" />
        )}
        <span>{pageEditorDisplayName}</span>
      </div>
    ),
    value: "pageEditor",
  };

  const fileEditorOption = {
    label: (
      <div style={viewOptionStyle}>
        {currentView === "fileEditor" ? (
          <>
            {switchingTo === "fileEditor" ? <Loader size="xs" /> : <FolderIcon fontSize="small" />}
            <span>Active Files</span>
          </>
        ) : (
          <>
            {switchingTo === "fileEditor" ? <Loader size="xs" /> : <FolderIcon fontSize="small" />}
            <span>Active Files</span>
          </>
        )}
      </div>
    ),
    value: "fileEditor",
  };

  // Build options array conditionally
  return [
    viewerOption,
    pageEditorOption,
    fileEditorOption,
  ];
};

interface TopControlsProps {
  currentView: WorkbenchType;
  setCurrentView: (view: WorkbenchType) => void;
  activeFiles?: Array<{ fileId: string; name: string; versionNumber?: number }>;
  currentFileIndex?: number;
  onFileSelect?: (index: number) => void;
}

const TopControls = ({
  currentView,
  setCurrentView,
  activeFiles = [],
  currentFileIndex = 0,
  onFileSelect,
}: TopControlsProps) => {
  const { isRainbowMode } = useRainbowThemeContext();
  const [switchingTo, setSwitchingTo] = useState<WorkbenchType | null>(null);

  // Get page editor state for dropdown
  const {
    files: pageEditorFiles = [],
    toggleFileSelection,
    reorderFiles: pageEditorReorderFiles,
  } = usePageEditor();

  // Convert to counts
  const selectedCount = pageEditorFiles?.filter(f => f.isSelected).length || 0;
  const totalCount = pageEditorFiles?.length || 0;

  // Create stable file IDs string for dependency (only changes when file set changes)
  const fileIdsString = (pageEditorFiles || []).map(f => f.fileId).sort().join(',');

  // Track color assignments by insertion order (files keep their color)
  const fileColorAssignments = React.useRef(new Map<string, number>());

  // Create stable file color mapping (preserves colors on reorder)
  const fileColorMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!pageEditorFiles || pageEditorFiles.length === 0) return map;

    const allFileIds = (pageEditorFiles || []).map(f => f.fileId as string);

    // Assign colors to new files based on insertion order
    allFileIds.forEach(fileId => {
      if (!fileColorAssignments.current.has(fileId)) {
        fileColorAssignments.current.set(fileId, fileColorAssignments.current.size);
      }
    });

    // Clean up removed files
    const activeSet = new Set(allFileIds);
    for (const fileId of fileColorAssignments.current.keys()) {
      if (!activeSet.has(fileId)) {
        fileColorAssignments.current.delete(fileId);
      }
    }

    return fileColorAssignments.current;
  }, [fileIdsString]);

  // Memoize the reorder handler - now much simpler!
  const handleReorder = useCallback((fromIndex: number, toIndex: number) => {
    pageEditorReorderFiles(fromIndex, toIndex);
  }, [pageEditorReorderFiles]);

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

  return (
    <div className="absolute left-0 w-full top-0 z-[100] pointer-events-none">
      <div className="flex justify-center mt-[0.5rem]">
        <SegmentedControl
          data={createViewOptions(
            currentView,
            switchingTo,
            activeFiles,
            currentFileIndex,
            onFileSelect,
            {
              files: pageEditorFiles,
              selectedCount,
              totalCount,
              onToggleSelection: toggleFileSelection,
              onReorder: handleReorder,
              fileColorMap,
            }
          )}
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
              borderRadius: 9999,
              maxHeight: '2.6rem',
            },
            control: {
              borderRadius: 9999,
            },
            indicator: {
              borderRadius: 9999,
              maxHeight: '2rem',
            },
            label: {
              paddingTop: '0rem',
            }
          }}
        />
      </div>
    </div>
  );
};

export default TopControls;
