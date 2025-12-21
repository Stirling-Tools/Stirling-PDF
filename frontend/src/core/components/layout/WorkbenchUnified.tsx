import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useFileManagement, useFileState, useFileSelection, useFileActions } from '@app/contexts/FileContext';
import { useViewer } from '@app/contexts/ViewerContext';
import { useNavigationActions, useNavigationState } from '@app/contexts/NavigationContext';
import Viewer from '@app/components/viewer/Viewer';
import AddFileCard from '@app/components/fileEditor/AddFileCard';
import FileEditorThumbnail from '@app/components/fileEditor/FileEditorThumbnail';
import styles from '@app/components/layout/WorkbenchUnified.module.css';
import type { FileId } from '@app/types/file';
import { isStirlingFile } from '@app/types/fileContext';
import { detectFileExtension } from '@app/utils/fileUtils';
import { alert } from '@app/components/toast';

interface FocusedPage {
  fileId: FileId;
  pageNumber: number;
}

interface WorkbenchUnifiedProps {
  sidebarsVisible: boolean;
  setSidebarsVisible: (value: boolean) => void;
  previewFile?: File | null;
  onClosePreview: () => void;
}

const WorkbenchUnified = ({
  sidebarsVisible,
  setSidebarsVisible,
  previewFile,
  onClosePreview,
}: WorkbenchUnifiedProps) => {
  const { t } = useTranslation();
  const prefersReducedMotion = useReducedMotion();
  const { selectors, state } = useFileState();
  const { addFiles, removeFiles, reorderFiles } = useFileManagement();
  const { setSelectedFiles } = useFileSelection();
  const { actions: fileActions } = useFileActions();
  const files = selectors.getStirlingFileStubs();
  const actualFiles = selectors.getFiles();
  const selectedFileIds = state.ui.selectedFileIds;

  const { workbench: currentView } = useNavigationState();
  const { actions: navActions } = useNavigationActions();
  const { activeFileIndex, setActiveFileIndex } = useViewer();

  // State machine
  const [expandedFileIds, setExpandedFileIds] = useState<Set<FileId>>(new Set());
  const [focusedPage, setFocusedPage] = useState<FocusedPage | null>(null);
  const viewerOpen = focusedPage !== null;

  // Sync NavigationContext with state machine
  useEffect(() => {
    if (viewerOpen) {
      if (currentView !== 'viewer') {
        navActions.setWorkbench('viewer');
      }
    } else if (expandedFileIds.size > 0) {
      if (currentView !== 'pageEditor') {
        navActions.setWorkbench('pageEditor');
      }
    } else {
      if (currentView !== 'fileEditor') {
        navActions.setWorkbench('fileEditor');
      }
    }
  }, [viewerOpen, expandedFileIds.size, currentView, navActions]);

  // Handle external view changes (e.g., from TopControls)
  useEffect(() => {
    if (currentView === 'viewer' && !viewerOpen) {
      // External request to open viewer - find first selected file or first file
      const targetFileId = selectedFileIds.length > 0 ? selectedFileIds[0] : files[0]?.id;
      if (targetFileId) {
        setFocusedPage({ fileId: targetFileId, pageNumber: 1 });
        const toIndex = actualFiles.findIndex(file => isStirlingFile(file) && file.fileId === targetFileId);
        if (toIndex >= 0) {
          setActiveFileIndex(toIndex);
        }
      }
    } else if (currentView === 'fileEditor' && (viewerOpen || expandedFileIds.size > 0)) {
      // External request to go to fileEditor - collapse everything
      setFocusedPage(null);
      setExpandedFileIds(new Set());
    } else if (currentView === 'pageEditor' && expandedFileIds.size === 0 && files.length > 0) {
      // External request to go to pageEditor - expand selected or first file
      const targetFileIds = selectedFileIds.length > 0 ? selectedFileIds : [files[0].id];
      setExpandedFileIds(new Set(targetFileIds));
    }
  }, [currentView, viewerOpen, expandedFileIds.size, files, selectedFileIds, actualFiles, setActiveFileIndex]);

  // File operations
  const handleAddFiles = useCallback(async (newFiles: File[]) => {
    if (newFiles.length === 0) return;
    await addFiles(newFiles, { selectFiles: true });
  }, [addFiles]);

  const toggleFile = useCallback((fileId: FileId) => {
    const isSelected = selectedFileIds.includes(fileId);
    let newSelection: FileId[];
    
    if (isSelected) {
      newSelection = selectedFileIds.filter(id => id !== fileId);
    } else {
      newSelection = [...selectedFileIds, fileId];
    }
    
    setSelectedFiles(newSelection);
  }, [selectedFileIds, setSelectedFiles]);

  const handleCloseFile = useCallback((fileId: FileId) => {
    removeFiles([fileId], false);
    const newSelection = selectedFileIds.filter(id => id !== fileId);
    setSelectedFiles(newSelection);
    // Remove from expanded if it was expanded
    setExpandedFileIds(prev => {
      const next = new Set(prev);
      next.delete(fileId);
      return next;
    });
  }, [removeFiles, selectedFileIds, setSelectedFiles]);

  const handleViewFile = useCallback((fileId: FileId) => {
    setSelectedFiles([fileId]);
    setFocusedPage({ fileId, pageNumber: 1 });
    const toIndex = actualFiles.findIndex(file => isStirlingFile(file) && file.fileId === fileId);
    if (toIndex >= 0) {
      setActiveFileIndex(toIndex);
    }
  }, [setSelectedFiles, actualFiles, setActiveFileIndex]);

  const handleReorderFiles = useCallback((sourceFileId: FileId, targetFileId: FileId, selectedFileIds: FileId[]) => {
    const currentIds = files.map(f => f.id);
    const sourceIndex = currentIds.findIndex(id => id === sourceFileId);
    const targetIndex = currentIds.findIndex(id => id === targetFileId);

    if (sourceIndex === -1 || targetIndex === -1) return;

    const filesToMove = selectedFileIds.length > 1
      ? selectedFileIds.filter(id => currentIds.includes(id))
      : [sourceFileId];

    const newOrder = [...currentIds];
    const sourceIndices = filesToMove.map(id => newOrder.findIndex(nId => nId === id))
      .sort((a, b) => b - a);

    sourceIndices.forEach(index => {
      newOrder.splice(index, 1);
    });

    let insertIndex = newOrder.findIndex(id => id === targetFileId);
    if (insertIndex !== -1) {
      const isMovingForward = sourceIndex < targetIndex;
      if (isMovingForward) {
        insertIndex += 1;
      }
    } else {
      insertIndex = newOrder.length;
    }

    newOrder.splice(insertIndex, 0, ...filesToMove);
    reorderFiles(newOrder);
  }, [files, reorderFiles]);

  const handleDownloadFile = useCallback((fileId: FileId) => {
    const file = selectors.getFile(fileId);
    if (file) {
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);
    }
  }, [selectors]);

  // Toggle file expansion
  const toggleFileExpanded = useCallback((fileId: FileId) => {
    setExpandedFileIds(prev => {
      const next = new Set(prev);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  }, []);

  // Open viewer from page thumbnail
  const handleOpenPage = useCallback((fileId: FileId, pageNumber: number) => {
    setFocusedPage({ fileId, pageNumber });
    const toIndex = actualFiles.findIndex(file => isStirlingFile(file) && file.fileId === fileId);
    if (toIndex >= 0) {
      setActiveFileIndex(toIndex);
    }
  }, [actualFiles, setActiveFileIndex]);

  // Close viewer
  const handleViewerClose = useCallback(() => {
    setFocusedPage(null);
    if (previewFile) {
      onClosePreview();
    }
  }, [previewFile, onClosePreview]);

  // Collapse all files
  const collapseAllFiles = useCallback(() => {
    setExpandedFileIds(new Set());
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (viewerOpen) {
          event.preventDefault();
          handleViewerClose();
        } else if (expandedFileIds.size > 0) {
          event.preventDefault();
          collapseAllFiles();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [viewerOpen, expandedFileIds.size, handleViewerClose, collapseAllFiles]);

  // Check if file is supported (for FileEditorThumbnail)
  const isFileSupported = useCallback((fileName: string): boolean => {
    const extension = detectFileExtension(fileName);
    return extension ? ['pdf'].includes(extension) : false;
  }, []);

  const anyExpanded = expandedFileIds.size > 0;
  // Convert pageNumber (1-based) to pageIndex (0-based) for Viewer
  const viewerInitialPage = focusedPage && viewerOpen 
    ? { fileId: focusedPage.fileId, pageIndex: focusedPage.pageNumber - 1 }
    : null;

  // Animation variants
  const fileMotionTransition = prefersReducedMotion 
    ? { duration: 0 } 
    : { type: 'spring', stiffness: 250, damping: 30 };

  const waftedStyle = prefersReducedMotion
    ? {}
    : {
        opacity: 0.3,
        scale: 0.98,
        y: 6,
      };

  return (
    <div className={styles.root}>
      <LayoutGroup>
        {/* File grid - using same layout as FileEditor */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gridAutoFlow: 'row dense',
            rowGap: '1.5rem',
            columnGap: '1.5rem',
            padding: '1rem',
            pointerEvents: 'auto'
          }}
        >
          {/* Add File Card */}
          {files.length > 0 && (
            <motion.div
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={fileMotionTransition}
            >
              <AddFileCard onFileSelect={handleAddFiles} />
            </motion.div>
          )}

          {/* File cards */}
          {files.map((file, index) => {
            const isExpanded = expandedFileIds.has(file.id);
            const wafted = anyExpanded && !isExpanded;

            return (
              <motion.div
                key={file.id}
                layout={!isExpanded}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{
                  opacity: wafted ? waftedStyle.opacity : 1,
                  scale: wafted ? waftedStyle.scale : 1,
                  y: wafted ? waftedStyle.y : 0,
                }}
                transition={fileMotionTransition}
                style={{
                  filter: wafted && !prefersReducedMotion ? 'blur(1px)' : 'none',
                  willChange: isExpanded ? 'auto' : 'transform',
                }}
              >
                <FileEditorThumbnail
                  file={file}
                  index={index}
                  totalFiles={files.length}
                  selectedFiles={selectedFileIds}
                  selectionMode={false}
                  onToggleFile={toggleFile}
                  onCloseFile={handleCloseFile}
                  onViewFile={handleViewFile}
                  _onSetStatus={(status) => alert({ alertType: 'neutral', title: status, expandable: false, durationMs: 2500 })}
                  onReorderFiles={handleReorderFiles}
                  onDownloadFile={handleDownloadFile}
                  isSupported={isFileSupported(file.name)}
                  // Controlled props for unified workbench
                  expanded={isExpanded}
                  onToggleExpanded={() => toggleFileExpanded(file.id)}
                  onOpenPage={handleOpenPage}
                />
              </motion.div>
            );
          })}
        </div>
      </LayoutGroup>

      {/* Shared element transition overlay for page -> viewer */}
      {/* This creates a smooth transition from the thumbnail to the viewer */}
      <AnimatePresence>
        {focusedPage && !prefersReducedMotion && (
          <motion.div
            className={styles.overlayPortal}
            layoutId={`page-${focusedPage.fileId}-${focusedPage.pageNumber}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            style={{
              pointerEvents: 'none',
            }}
          />
        )}
      </AnimatePresence>

      {/* Viewer */}
      <AnimatePresence>
        {viewerOpen && (
          <motion.div
            className={styles.viewerStage}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.25 }}
          >
            <div className={styles.viewerDismissZone}>
              <button
                type="button"
                className={styles.viewerBackButton}
                onClick={handleViewerClose}
              >
                {t('workbench.backToPages', 'Back to pages')}
              </button>
            </div>
            <div className={styles.viewerCanvas}>
              <Viewer
                sidebarsVisible={sidebarsVisible}
                setSidebarsVisible={setSidebarsVisible}
                previewFile={previewFile}
                onClose={handleViewerClose}
                activeFileIndex={activeFileIndex}
                setActiveFileIndex={setActiveFileIndex}
                initialPage={viewerInitialPage}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default WorkbenchUnified;
