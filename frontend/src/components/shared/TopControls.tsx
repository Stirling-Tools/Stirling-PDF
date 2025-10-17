import React, { useState, useCallback, useMemo } from "react";
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
import { useFileState } from '../../contexts/FileContext';
import { useToolWorkflow } from '../../contexts/ToolWorkflowContext';
import { FileId } from '../../types/file';

// Local interface for PageEditor file display
interface PageEditorFile {
  fileId: FileId;
  name: string;
  versionNumber?: number;
  isSelected: boolean;
}

interface PageEditorState {
  files: PageEditorFile[];
  selectedCount: number;
  totalCount: number;
  onToggleSelection: (fileId: FileId) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  fileColorMap: Map<string, number>;
}

// View option styling
const viewOptionStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  justifyContent: 'center',
};

// Helper function to create view options for SegmentedControl
const createViewOptions = (
  currentView: WorkbenchType,
  switchingTo: WorkbenchType | null,
  activeFiles?: Array<{ fileId: string; name: string; versionNumber?: number }>,
  currentFileIndex?: number,
  onFileSelect?: (index: number) => void,
  pageEditorState?: PageEditorState
) => {
  // Viewer dropdown logic
  const isInViewer = currentView === 'viewer';
  const hasActiveFiles = activeFiles && activeFiles.length > 0;
  const showViewerDropdown = isInViewer && hasActiveFiles;

  let viewerDisplayName = 'Viewer';
  if (isInViewer && hasActiveFiles && currentFileIndex !== undefined) {
    const currentFile = activeFiles[currentFileIndex];
    if (currentFile) {
      viewerDisplayName = currentFile.name;
    }
  }

  const viewerOption = {
    label: showViewerDropdown ? (
      <FileDropdownMenu
        displayName={viewerDisplayName}
        activeFiles={activeFiles!}
        currentFileIndex={currentFileIndex!}
        onFileSelect={onFileSelect!}
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
        <span>{viewerDisplayName}</span>
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

  // Get FileContext state and PageEditor coordination functions
  const { state, selectors } = useFileState();
  const pageEditorContext = usePageEditor();
  const {
    toggleFileSelection,
    reorderFiles: pageEditorReorderFiles,
    fileOrder: pageEditorFileOrder,
  } = pageEditorContext;

  // Derive page editor files from PageEditorContext.fileOrder (page editor workspace order)
  // Filter to only show PDF files (PageEditor only supports PDFs)
  // Use stable string keys to prevent infinite loops
  // Cache file objects to prevent infinite re-renders from new object references
  const fileOrderKey = pageEditorFileOrder.join(',');
  const selectedIdsKey = [...state.ui.selectedFileIds].sort().join(',');
  const filesSignature = selectors.getFilesSignature();

  const fileObjectsRef = React.useRef(new Map<FileId, PageEditorFile>());

  const pageEditorFiles = useMemo<PageEditorFile[]>(() => {
    const cache = fileObjectsRef.current;
    const newFiles: PageEditorFile[] = [];

    // Use PageEditorContext.fileOrder instead of state.files.ids
    pageEditorFileOrder.forEach(fileId => {
      const stub = selectors.getStirlingFileStub(fileId);
      const isSelected = state.ui.selectedFileIds.includes(fileId);
      const isPdf = stub?.name?.toLowerCase().endsWith('.pdf') ?? false;

      if (!isPdf) return; // Skip non-PDFs

      const cached = cache.get(fileId);

      // Check if data actually changed (compare by fileId, not position)
      if (cached &&
          cached.fileId === fileId &&
          cached.name === (stub?.name || '') &&
          cached.versionNumber === stub?.versionNumber &&
          cached.isSelected === isSelected) {
        // Reuse existing object reference
        newFiles.push(cached);
      } else {
        // Create new object only if data changed
        const newFile: PageEditorFile = {
          fileId,
          name: stub?.name || '',
          versionNumber: stub?.versionNumber,
          isSelected,
        };
        cache.set(fileId, newFile);
        newFiles.push(newFile);
      }
    });

    // Clean up removed files from cache
    const activeIds = new Set(newFiles.map(f => f.fileId));
    for (const cachedId of cache.keys()) {
      if (!activeIds.has(cachedId)) {
        cache.delete(cachedId);
      }
    }

    return newFiles;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileOrderKey, selectedIdsKey, filesSignature, pageEditorFileOrder, state.ui.selectedFileIds, selectors]);

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

  // Get pageEditorFunctions from ToolWorkflowContext
  const { pageEditorFunctions } = useToolWorkflow();

  // Memoize the reorder handler
  const handleReorder = useCallback((fromIndex: number, toIndex: number) => {
    // Reorder files in PageEditorContext (updates fileOrder)
    pageEditorReorderFiles(fromIndex, toIndex);

    // Also reorder pages directly
    const newOrder = [...pageEditorFileOrder];
    const [movedFileId] = newOrder.splice(fromIndex, 1);
    newOrder.splice(toIndex, 0, movedFileId);

    // Call reorderPagesByFileOrder if available
    if (pageEditorFunctions?.reorderPagesByFileOrder) {
      pageEditorFunctions.reorderPagesByFileOrder(newOrder);
    }
  }, [pageEditorReorderFiles, pageEditorFileOrder, pageEditorFunctions]);

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

  // Memoize pageEditorState object to prevent recreating on every render
  const pageEditorState = useMemo<PageEditorState>(() => ({
    files: pageEditorFiles,
    selectedCount,
    totalCount,
    onToggleSelection: toggleFileSelection,
    onReorder: handleReorder,
    fileColorMap,
  }), [pageEditorFiles, selectedCount, totalCount, toggleFileSelection, handleReorder, fileColorMap]);

  // Memoize view options to prevent SegmentedControl re-renders
  const viewOptions = useMemo(() => createViewOptions(
    currentView,
    switchingTo,
    activeFiles,
    currentFileIndex,
    onFileSelect,
    pageEditorState
  ), [currentView, switchingTo, activeFiles, currentFileIndex, onFileSelect, pageEditorState]);

  return (
    <div className="absolute left-0 w-full top-0 z-[100] pointer-events-none">
      <div className="flex justify-center mt-[0.5rem]">
        <SegmentedControl
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
