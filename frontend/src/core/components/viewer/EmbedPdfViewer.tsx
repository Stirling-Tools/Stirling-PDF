import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Center, Text, ActionIcon } from '@mantine/core';
import LocalIcon from '@app/components/shared/LocalIcon';

import { useFileState, useFileActions } from "@app/contexts/FileContext";
import { useFileWithUrl } from "@app/hooks/useFileWithUrl";
import { useViewer } from "@app/contexts/ViewerContext";
import { LocalEmbedPDF } from '@app/components/viewer/LocalEmbedPDF';
import { PdfViewerToolbar } from '@app/components/viewer/PdfViewerToolbar';
import { ThumbnailSidebar } from '@app/components/viewer/ThumbnailSidebar';
import { BookmarkSidebar } from '@app/components/viewer/BookmarkSidebar';
import { useNavigationGuard, useNavigationState } from '@app/contexts/NavigationContext';
import { useSignature } from '@app/contexts/SignatureContext';
import { createStirlingFilesAndStubs } from '@app/services/fileStubHelpers';
import NavigationWarningModal from '@app/components/shared/NavigationWarningModal';
import { isStirlingFile } from '@app/types/fileContext';
import { useViewerRightRailButtons } from '@app/components/viewer/useViewerRightRailButtons';
import { StampPlacementOverlay } from '@app/components/viewer/StampPlacementOverlay';
import { useWheelZoom } from '@app/hooks/useWheelZoom';

export interface EmbedPdfViewerProps {
  sidebarsVisible: boolean;
  setSidebarsVisible: (v: boolean) => void;
  onClose?: () => void;
  previewFile?: File | null;
  activeFileIndex?: number;
  setActiveFileIndex?: (index: number) => void;
}

const EmbedPdfViewerContent = ({
  sidebarsVisible: _sidebarsVisible,
  setSidebarsVisible: _setSidebarsVisible,
  onClose,
  previewFile,
  activeFileIndex: externalActiveFileIndex,
  setActiveFileIndex: externalSetActiveFileIndex,
}: EmbedPdfViewerProps) => {
  const viewerRef = React.useRef<HTMLDivElement>(null);
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  const [isViewerHovered, setIsViewerHovered] = React.useState(false);

  const {
    isThumbnailSidebarVisible,
    toggleThumbnailSidebar,
    isBookmarkSidebarVisible,
    isSearchInterfaceVisible,
    searchInterfaceActions,
    zoomActions,
    panActions: _panActions,
    rotationActions: _rotationActions,
    getScrollState,
    getRotationState,
    isAnnotationMode,
    setAnnotationMode,
    isAnnotationsVisible,
    exportActions,
  } = useViewer();

  const scrollState = getScrollState();
  const rotationState = getRotationState();

  // Track initial rotation to detect changes
  const initialRotationRef = useRef<number | null>(null);
  useEffect(() => {
    if (initialRotationRef.current === null && rotationState.rotation !== undefined) {
      initialRotationRef.current = rotationState.rotation;
    }
  }, [rotationState.rotation]);

  // Get signature and annotation contexts
  const { signatureApiRef, annotationApiRef, historyApiRef, signatureConfig, isPlacementMode } = useSignature();

  // Track whether there are unsaved annotation changes in this viewer session.
  // This is our source of truth for navigation guards; it is set when the
  // annotation history changes, and cleared after we successfully apply changes.
  const hasAnnotationChangesRef = useRef(false);

  // Get current file from FileContext
  const { selectors, state } = useFileState();
  const { actions } = useFileActions();
  const activeFiles = selectors.getFiles();
  const activeFileIds = activeFiles.map(f => f.fileId);
  const selectedFileIds = state.ui.selectedFileIds;

  // Navigation guard for unsaved changes
  const { setHasUnsavedChanges, registerUnsavedChangesChecker, unregisterUnsavedChangesChecker } = useNavigationGuard();

  // Check if we're in an annotation tool
  const { selectedTool } = useNavigationState();
  // Tools that require the annotation layer (Sign, Add Text, Add Image, Annotate)
  const isInAnnotationTool = selectedTool === 'sign' || selectedTool === 'addText' || selectedTool === 'addImage' || selectedTool === 'annotate';

  // Sync isAnnotationMode in ViewerContext with current tool
  useEffect(() => {
    setAnnotationMode(isInAnnotationTool);
  }, [isInAnnotationTool, setAnnotationMode]);

  const isPlacementOverlayActive = Boolean(
    isInAnnotationTool && isPlacementMode && signatureConfig
  );

  // Track which file tab is active
  const [internalActiveFileIndex, setInternalActiveFileIndex] = useState(0);
  const activeFileIndex = externalActiveFileIndex ?? internalActiveFileIndex;
  const setActiveFileIndex = externalSetActiveFileIndex ?? setInternalActiveFileIndex;
  const hasInitializedFromSelection = useRef(false);

  // When viewer opens with a selected file, switch to that file
  useEffect(() => {
    if (!hasInitializedFromSelection.current && selectedFileIds.length > 0 && activeFiles.length > 0) {
      const selectedFileId = selectedFileIds[0];
      const index = activeFiles.findIndex(f => f.fileId === selectedFileId);
      if (index !== -1 && index !== activeFileIndex) {
        setActiveFileIndex(index);
      }
      hasInitializedFromSelection.current = true;
    }
  }, [selectedFileIds, activeFiles, activeFileIndex]);

  // Reset active tab if it's out of bounds
  useEffect(() => {
    if (activeFileIndex >= activeFiles.length && activeFiles.length > 0) {
      setActiveFileIndex(0);
    }
  }, [activeFiles.length, activeFileIndex]);

  // Determine which file to display
  const currentFile = React.useMemo(() => {
    if (previewFile) {
      return previewFile;
    } else if (activeFiles.length > 0) {
      return activeFiles[activeFileIndex] || activeFiles[0];
    }
    return null;
  }, [previewFile, activeFiles, activeFileIndex]);

  // Get file with URL for rendering
  const fileWithUrl = useFileWithUrl(currentFile);

  // Determine the effective file to display
  const effectiveFile = React.useMemo(() => {
    if (previewFile) {
      // In preview mode, show the preview file
      if (previewFile.size === 0) {
        return null;
      }
      return { file: previewFile, url: null };
    } else {
      return fileWithUrl;
    }
  }, [previewFile, fileWithUrl]);

  const bookmarkCacheKey = React.useMemo(() => {
    if (currentFile && isStirlingFile(currentFile)) {
      return currentFile.fileId;
    }

    if (previewFile) {
      const uniquePreviewId = `${previewFile.name}-${previewFile.size}-${previewFile.lastModified ?? 'na'}`;
      return `preview-${uniquePreviewId}`;
    }

    if (effectiveFile?.url) {
      return effectiveFile.url;
    }

    if (effectiveFile?.file instanceof File) {
      const fileObj = effectiveFile.file;
      return `file-${fileObj.name}-${fileObj.size}-${fileObj.lastModified ?? 'na'}`;
    }

    return undefined;
  }, [currentFile, effectiveFile, previewFile]);

  // Generate cache keys for all active files to enable preloading
  const allBookmarkCacheKeys = React.useMemo(() => {
    if (previewFile) {
      return [bookmarkCacheKey].filter(Boolean) as string[];
    }

    return activeFiles.map(file => {
      if (isStirlingFile(file)) {
        return file.fileId;
      }
      return undefined;
    }).filter(Boolean) as string[];
  }, [activeFiles, previewFile, bookmarkCacheKey]);

  useWheelZoom({
    ref: viewerRef,
    onZoomIn: zoomActions.zoomIn,
    onZoomOut: zoomActions.zoomOut,
  });

  // Handle keyboard shortcuts (zoom and search)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isViewerHovered) return;

      // Check if Ctrl (Windows/Linux) or Cmd (Mac) is pressed
      if (event.ctrlKey || event.metaKey) {
        if (event.key === '=' || event.key === '+') {
          // Ctrl+= or Ctrl++ for zoom in
          event.preventDefault();
          zoomActions.zoomIn();
        } else if (event.key === '-' || event.key === '_') {
          // Ctrl+- for zoom out
          event.preventDefault();
          zoomActions.zoomOut();
        } else if (event.key === 'f' || event.key === 'F') {
          // Ctrl+F for search
          event.preventDefault();
          if (isSearchInterfaceVisible) {
            // If already open, trigger refocus event
            window.dispatchEvent(new CustomEvent('refocus-search-input'));
          } else {
            // Open search interface
            searchInterfaceActions.open();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isViewerHovered, isSearchInterfaceVisible, zoomActions, searchInterfaceActions]);

  // Watch the annotation history API to detect when the document becomes "dirty".
  // We treat any change that makes the history undoable as unsaved changes until
  // the user explicitly applies them via applyChanges.
  useEffect(() => {
    const historyApi = historyApiRef.current;
    if (!historyApi || !historyApi.subscribe) {
      return;
    }

    const updateHasChanges = () => {
      const canUndo = historyApi.canUndo?.() ?? false;
      if (!hasAnnotationChangesRef.current && canUndo) {
        hasAnnotationChangesRef.current = true;
        setHasUnsavedChanges(true);
      }
    };

    const unsubscribe = historyApi.subscribe(updateHasChanges);
    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [historyApiRef.current, setHasUnsavedChanges]);

  // Register checker for unsaved changes (annotations only for now)
  useEffect(() => {
    if (previewFile) {
      return;
    }

    const checkForChanges = () => {
      const hasAnnotationChanges = hasAnnotationChangesRef.current;
      return hasAnnotationChanges;
    };

    registerUnsavedChangesChecker(checkForChanges);

    return () => {
      unregisterUnsavedChangesChecker();
    };
  }, [previewFile, registerUnsavedChangesChecker, unregisterUnsavedChangesChecker]);

  // Apply changes - save annotations to new file version
  const applyChanges = useCallback(async () => {
    if (!currentFile || activeFileIds.length === 0) return;

    try {
      // Step 1: Export PDF with annotations using EmbedPDF
      const arrayBuffer = await exportActions.saveAsCopy();
      if (!arrayBuffer) {
        throw new Error('Failed to export PDF');
      }

      // Step 2: Convert ArrayBuffer to File
      const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
      const filename = currentFile.name || 'document.pdf';
      const file = new File([blob], filename, { type: 'application/pdf' });

      // Step 3: Create StirlingFiles and stubs for version history
      const parentStub = selectors.getStirlingFileStub(activeFileIds[0]);
      if (!parentStub) throw new Error('Parent stub not found');

      const { stirlingFiles, stubs } = await createStirlingFilesAndStubs([file], parentStub, 'multiTool');

      // Step 4: Consume files (replace in context)
      await actions.consumeFiles(activeFileIds, stirlingFiles, stubs);

      // Mark annotations as saved so navigation away from the viewer is allowed.
      hasAnnotationChangesRef.current = false;
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error('Apply changes failed:', error);
    }
  }, [currentFile, activeFileIds, exportActions, actions, selectors, setHasUnsavedChanges]);

  // Expose annotation apply via a global event so tools (like Annotate) can
  // trigger saves from the left sidebar without tight coupling.
  useEffect(() => {
    const handler = () => {
      void applyChanges();
    };
    window.addEventListener('stirling-annotations-apply', handler);
    return () => {
      window.removeEventListener('stirling-annotations-apply', handler);
    };
  }, [applyChanges]);

  // Register viewer right-rail buttons
  useViewerRightRailButtons();

  const sidebarWidthRem = 15;
  const totalRightMargin =
    (isThumbnailSidebarVisible ? sidebarWidthRem : 0) + (isBookmarkSidebarVisible ? sidebarWidthRem : 0);

  return (
    <Box
      ref={viewerRef}
      onMouseEnter={() => setIsViewerHovered(true)}
      onMouseLeave={() => setIsViewerHovered(false)}
      style={{
        position: 'relative',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        contain: 'layout style paint'
      }}>
      {/* Close Button - Only show in preview mode */}
      {onClose && previewFile && (
        <ActionIcon
          variant="filled"
          color="gray"
          size="lg"
          style={{ position: 'absolute', top: '1rem', right: '1rem', zIndex: 1000, borderRadius: '50%' }}
          onClick={onClose}
        >
          <LocalIcon icon="close-rounded" width={24} height={24} />
        </ActionIcon>
      )}

      {!effectiveFile ? (
        <Center style={{ flex: 1 }}>
          <Text c="red">Error: No file provided to viewer</Text>
        </Center>
      ) : (
        <>
          {/* EmbedPDF Viewer */}
          <Box
            ref={pdfContainerRef}
            style={{
              position: 'relative',
              flex: 1,
              overflow: 'hidden',
              minHeight: 0,
              minWidth: 0,
              marginRight: `${totalRightMargin}rem`,
              transition: 'margin-right 0.3s ease'
            }}>
            <LocalEmbedPDF
              key={currentFile && isStirlingFile(currentFile) ? currentFile.fileId : (effectiveFile.file instanceof File ? effectiveFile.file.name : effectiveFile.url)}
              file={effectiveFile.file}
              url={effectiveFile.url}
              enableAnnotations={isAnnotationMode}
              showBakedAnnotations={isAnnotationsVisible}
              signatureApiRef={signatureApiRef as React.RefObject<any>}
              annotationApiRef={annotationApiRef as React.RefObject<any>}
              historyApiRef={historyApiRef as React.RefObject<any>}
              onSignatureAdded={() => {
                // Handle signature added - for debugging, enable console logs as needed
                // Future: Handle signature completion
              }}
            />
            <StampPlacementOverlay
              containerRef={pdfContainerRef}
              isActive={isPlacementOverlayActive}
              signatureConfig={signatureConfig}
            />
          </Box>
        </>
      )}

      {/* Bottom Toolbar Overlay */}
      {effectiveFile && (
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 50,
            display: "flex",
            justifyContent: "center",
            pointerEvents: "none",
            background: "transparent",
          }}
        >
          <div style={{ pointerEvents: "auto" }}>
            <PdfViewerToolbar
              currentPage={scrollState.currentPage}
              totalPages={scrollState.totalPages}
            />
          </div>
        </div>
      )}


      {/* Thumbnail Sidebar */}
      <ThumbnailSidebar
        visible={isThumbnailSidebarVisible}
        onToggle={toggleThumbnailSidebar}
        activeFileIndex={activeFileIndex}
      />
      <BookmarkSidebar
        visible={isBookmarkSidebarVisible}
        thumbnailVisible={isThumbnailSidebarVisible}
        documentCacheKey={bookmarkCacheKey}
        preloadCacheKeys={allBookmarkCacheKeys}
      />

      {/* Navigation Warning Modal */}
      {!previewFile && (
        <NavigationWarningModal
          onApplyAndContinue={async () => {
            await applyChanges();
          }}
        />
      )}
    </Box>
  );
};

const EmbedPdfViewer = (props: EmbedPdfViewerProps) => {
  return <EmbedPdfViewerContent {...props} />;
};

export default EmbedPdfViewer;
