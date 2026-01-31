import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Text, Center, Box, LoadingOverlay, Stack } from "@mantine/core";
import { useFileState, useFileActions } from "@app/contexts/FileContext";
import { useNavigationGuard } from "@app/contexts/NavigationContext";
import { usePageEditor } from "@app/contexts/PageEditorContext";
import { PageEditorFunctions, PDFPage } from "@app/types/pageEditor";
// Thumbnail generation is now handled by individual PageThumbnail components
import '@app/components/pageEditor/PageEditor.module.css';
import PageThumbnail from '@app/components/pageEditor/PageThumbnail';
import DragDropGrid from '@app/components/pageEditor/DragDropGrid';
import SkeletonLoader from '@app/components/shared/SkeletonLoader';
import NavigationWarningModal from '@app/components/shared/NavigationWarningModal';
import { FileId } from "@app/types/file";
import { GRID_CONSTANTS } from '@app/components/pageEditor/constants';
import { useInitialPageDocument } from '@app/components/pageEditor/hooks/useInitialPageDocument';
import { usePageDocument } from '@app/components/pageEditor/hooks/usePageDocument';
import { usePageEditorState } from '@app/components/pageEditor/hooks/usePageEditorState';
import { usePageEditorRightRailButtons } from "@app/components/pageEditor/pageEditorRightRailButtons";
import { useFileColorMap } from "@app/components/pageEditor/hooks/useFileColorMap";
import { useWheelZoom } from "@app/hooks/useWheelZoom";
import { useEditedDocumentState } from "@app/components/pageEditor/hooks/useEditedDocumentState";
import { useUndoManagerState } from "@app/components/pageEditor/hooks/useUndoManagerState";
import { usePageSelectionManager } from "@app/components/pageEditor/hooks/usePageSelectionManager";
import { usePageEditorCommands } from "@app/components/pageEditor/hooks/useEditorCommands";
import { usePageEditorExport } from "@app/components/pageEditor/hooks/usePageEditorExport";
import { useThumbnailGeneration } from "@app/hooks/useThumbnailGeneration";

export interface PageEditorProps {
  onFunctionsReady?: (functions: PageEditorFunctions) => void;
}

const PageEditor = ({
  onFunctionsReady,
}: PageEditorProps) => {

  // Use split contexts to prevent re-renders
  const { state, selectors } = useFileState();
  const { actions } = useFileActions();

  // Navigation guard for unsaved changes
  const { setHasUnsavedChanges } = useNavigationGuard();

  // Get PageEditor coordination functions
  const {
    updateFileOrderFromPages,
    fileOrder,
    reorderedPages,
    clearReorderedPages,
    updateCurrentPages,
    savePersistedDocument,
  } = usePageEditor();

  const [visiblePageIds, setVisiblePageIds] = useState<string[]>([]);
  const thumbnailRequestsRef = useRef<Set<string>>(new Set());
  const { requestThumbnail, getThumbnailFromCache } = useThumbnailGeneration();
  const handleVisibleItemsChange = useCallback((items: PDFPage[]) => {
    setVisiblePageIds(prev => {
      const ids = items.map(item => item.id);
      if (prev.length === ids.length && prev.every((id, index) => id === ids[index])) {
        return prev;
      }
      return ids;
    });
  }, []);

  // Zoom state management
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isContainerHovered, setIsContainerHovered] = useState(false);
  const rootFontSize = useMemo(() => {
    if (typeof window === 'undefined') {
      return 16;
    }
    const computed = getComputedStyle(document.documentElement).fontSize;
    const parsed = parseFloat(computed);
    return Number.isNaN(parsed) ? 16 : parsed;
  }, []);
  const itemGapPx = useMemo(() => {
    return parseFloat(GRID_CONSTANTS.ITEM_GAP) * rootFontSize * zoomLevel;
  }, [rootFontSize, zoomLevel]);

  // Zoom actions
  const zoomIn = useCallback(() => {
    setZoomLevel(prev => Math.min(prev + 0.1, 3.0));
  }, []);

  const zoomOut = useCallback(() => {
    setZoomLevel(prev => Math.max(prev - 0.1, 0.5));
  }, []);

  // Derive page editor files from PageEditorContext's fileOrder (page editor workspace order)
  // Filter to only show PDF files (PageEditor only supports PDFs)
  // Use stable string keys to prevent infinite loops
  // Cache file objects to prevent infinite re-renders from new object references
  const fileOrderKey = fileOrder.join(',');
  const selectedIdsKey = [...state.ui.selectedFileIds].sort().join(',');
  const filesSignature = selectors.getFilesSignature();

  const fileObjectsRef = useRef(new Map<FileId, any>());
  const gridItemRefsRef = useRef<React.MutableRefObject<Map<string, HTMLDivElement>> | null>(null);

  const pageEditorFiles = useMemo(() => {
    const cache = fileObjectsRef.current;
    const newFiles: any[] = [];

    fileOrder.forEach(fileId => {
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
        const newFile = {
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
  }, [fileOrderKey, selectedIdsKey, filesSignature]);

  // Get ALL file IDs in order (not filtered by selection)
  const orderedFileIds = useMemo(() => {
    return pageEditorFiles.map(f => f.fileId);
  }, [pageEditorFiles]);

  // Get selected file IDs for filtering
  const selectedFileIds = useMemo(() => {
    return pageEditorFiles.filter(f => f.isSelected).map(f => f.fileId);
  }, [pageEditorFiles]);
  const activeFilesSignature = selectors.getFilesSignature();

  // UI state
  const globalProcessing = state.ui.isProcessing;

  const initialDocument = useInitialPageDocument();
  const { document: mergedPdfDocument } = usePageDocument();

  const { setEditedDocument, displayDocument, getEditedDocument } = useEditedDocumentState({
    initialDocument,
    mergedPdfDocument,
    reorderedPages,
    clearReorderedPages,
    fileOrder,
    updateCurrentPages,
  });

  const displayDocumentRef = useRef(displayDocument);
  useEffect(() => {
    displayDocumentRef.current = displayDocument;
  }, [displayDocument]);

  useEffect(() => {
    return () => {
      const doc = displayDocumentRef.current;
      if (doc && doc.pages.length > 0) {
        const signature = doc.pages.map(page => page.id).join(',');
        savePersistedDocument(doc, signature);
      }
    };
  }, [savePersistedDocument]);

  // UI state management
  const {
    selectionMode, selectedPageIds, movingPage, isAnimating, splitPositions, exportLoading,
    setSelectionMode, setSelectedPageIds, setMovingPage, setSplitPositions, setExportLoading,
    togglePage, toggleSelectAll, animateReorder
  } = usePageEditorState();

  const {
    csvInput,
    setCsvInput,
    totalPages,
    getPageNumbersFromIds,
    handleSelectAll,
    handleDeselectAll,
    handleSetSelectedPages,
    updatePagesFromCSV,
  } = usePageSelectionManager({
    displayDocument,
    selectedPageIds,
    setSelectedPageIds,
    setSelectionMode,
    toggleSelectAll,
    activeFilesSignature,
  });

  // Grid container ref for positioning split indicators
  const gridContainerRef = useRef<HTMLDivElement>(null);

  const {
    canUndo,
    canRedo,
    executeCommandWithTracking,
    handleUndo,
    handleRedo,
    clearUndoHistory,
  } = useUndoManagerState({ setHasUnsavedChanges });

  const {
    createRotateCommand,
    createDeleteCommand,
    createSplitCommand,
    executeCommand,
    handleRotate,
    handleDelete,
    handleDeletePage,
    handleSplit,
    handleSplitAll,
    handlePageBreak,
    handlePageBreakAll,
    handleInsertFiles,
    handleReorderPages,
    closePdf,
  } = usePageEditorCommands({
    displayDocument,
    getEditedDocument,
    setEditedDocument,
    splitPositions,
    setSplitPositions,
    selectedPageIds,
    setSelectedPageIds,
    getPageNumbersFromIds,
    executeCommandWithTracking,
    updateFileOrderFromPages,
    actions,
    selectors,
    setSelectionMode,
    clearUndoHistory,
  });

  const { onExportSelected, onExportAll, applyChanges } = usePageEditorExport({
    displayDocument,
    selectedPageIds,
    splitPositions,
    selectedFileIds,
    selectors,
    actions,
    setHasUnsavedChanges,
    exportLoading,
    setExportLoading,
    setSplitPositions,
  });

  useEffect(() => {
    if (!displayDocument || visiblePageIds.length === 0) {
      return;
    }

    const pending = thumbnailRequestsRef.current.size;
    const MAX_CONCURRENT_THUMBNAILS = 12;
    const available = Math.max(0, MAX_CONCURRENT_THUMBNAILS - pending);
    if (available === 0) {
      return;
    }

    const toLoad: string[] = [];
    for (const pageId of visiblePageIds) {
      if (toLoad.length >= available) break;
      if (thumbnailRequestsRef.current.has(pageId)) continue;
      const page = displayDocument.pages.find(p => p.id === pageId);
      if (!page || page.thumbnail) continue;
      toLoad.push(pageId);
    }

    if (toLoad.length === 0) return;

    toLoad.forEach(pageId => {
      const page = displayDocument.pages.find(p => p.id === pageId);
      if (!page) return;

      const cached = getThumbnailFromCache(pageId);
      if (cached) {
        thumbnailRequestsRef.current.add(pageId);
        Promise.resolve(cached)
          .then(cache => {
            setEditedDocument(prev => {
              if (!prev) return prev;
              const pageIndex = prev.pages.findIndex(p => p.id === pageId);
              if (pageIndex === -1) return prev;

              // Only create new page object for the changed page, reuse rest
              const updated = [...prev.pages];
              updated[pageIndex] = { ...prev.pages[pageIndex], thumbnail: cache };
              return { ...prev, pages: updated };
            });
          })
          .finally(() => {
            thumbnailRequestsRef.current.delete(pageId);
          });
        return;
      }

      const fileId = page.originalFileId;
      if (!fileId) return;
      const file = selectors.getFile(fileId);
      if (!file) return;

      thumbnailRequestsRef.current.add(pageId);
      requestThumbnail(pageId, file, page.originalPageNumber || page.pageNumber)
        .then(thumbnail => {
          if (thumbnail) {
            setEditedDocument(prev => {
              if (!prev) return prev;
              const pageIndex = prev.pages.findIndex(p => p.id === pageId);
              if (pageIndex === -1) return prev;

              // Only create new page object for the changed page, reuse rest
              const updated = [...prev.pages];
              updated[pageIndex] = { ...prev.pages[pageIndex], thumbnail };
              return { ...prev, pages: updated };
            });
          }
        })
        .catch((error) => {
          console.error('[Thumbnail Loading] Error:', error);
        })
        .finally(() => {
          thumbnailRequestsRef.current.delete(pageId);
        });
    });
  }, [
    displayDocument,
    visiblePageIds,
    selectors,
    requestThumbnail,
    getThumbnailFromCache,
    setEditedDocument,
  ]);

  // Derived values for right rail and usePageEditorRightRailButtons (must be after displayDocument)
  const selectedPageCount = selectedPageIds.length;
  const activeFileIds = selectedFileIds;

  usePageEditorRightRailButtons({
    totalPages,
    selectedPageCount,
    csvInput,
    setCsvInput,
    selectedPageIds,
    displayDocument: displayDocument || undefined,
    updatePagesFromCSV,
    handleSelectAll,
    handleDeselectAll,
    handleDelete,
    onExportSelected,
    onSaveChanges: applyChanges,
    exportLoading,
    activeFileCount: activeFileIds.length,
    closePdf,
  });

  // Export preview function - defined after export functions to avoid circular dependency
  const handleExportPreview = useCallback((selectedOnly: boolean = false) => {
    if (!displayDocument) return;

    // For now, trigger the actual export directly
   // In the original, this would show a preview modal first
    if (selectedOnly) {
      onExportSelected();
    } else {
      onExportAll();
    }
  }, [displayDocument, onExportSelected, onExportAll]);

  // Expose functions to parent component
  useEffect(() => {
    if (onFunctionsReady) {
      onFunctionsReady({
        handleUndo,
        handleRedo,
        canUndo,
        canRedo,
        handleRotate,
        handleDelete,
        handleSplit,
        handleSplitAll,
        handlePageBreak,
        handlePageBreakAll,
        handleSelectAll,
        handleDeselectAll,
        handleSetSelectedPages,
        showExportPreview: handleExportPreview,
        onExportSelected,
        onExportAll,
        applyChanges,
        exportLoading,
        selectionMode,
        selectedPageIds,
        displayDocument: displayDocument || undefined,
        splitPositions,
        totalPages: displayDocument?.pages.length || 0,
        closePdf,
      });
    }
  }, [
    onFunctionsReady, handleUndo, handleRedo, canUndo, canRedo, handleRotate, handleDelete, handleSplit, handleSplitAll,
    handlePageBreak, handlePageBreakAll, handleSelectAll, handleDeselectAll, handleSetSelectedPages, handleExportPreview, onExportSelected, onExportAll, applyChanges, exportLoading,
    selectionMode, selectedPageIds, splitPositions, displayDocument?.pages.length, closePdf
  ]);

  useWheelZoom({
    ref: containerRef,
    onZoomIn: zoomIn,
    onZoomOut: zoomOut,
    enabled: !!displayDocument,
  });

  // Handle keyboard zoom shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isContainerHovered) return;

      // Check if Ctrl (Windows/Linux) or Cmd (Mac) is pressed
      if (event.ctrlKey || event.metaKey) {
        if (event.key === '=' || event.key === '+') {
          // Ctrl+= or Ctrl++ for zoom in
          event.preventDefault();
          zoomIn();
        } else if (event.key === '-' || event.key === '_') {
          // Ctrl+- for zoom out
          event.preventDefault();
          zoomOut();
        } else if (event.key === '0') {
          // Ctrl+0 for reset zoom
          event.preventDefault();
          setZoomLevel(1.0);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isContainerHovered, zoomIn, zoomOut]);

  // Display all pages - use edited or original document
  const displayedPages = displayDocument?.pages || [];

  // Track color assignments by insertion order (files keep their color)
  const fileColorIndexMap = useFileColorMap(orderedFileIds);

  return (
    <div
      ref={containerRef}
      data-scrolling-container="true"
      onMouseEnter={() => setIsContainerHovered(true)}
      onMouseLeave={() => setIsContainerHovered(false)}
      style={{
        height: '100%',
        overflow: 'auto',
        position: 'relative',
        width: '100%',
      }}
    >
      <LoadingOverlay visible={globalProcessing && !initialDocument} />

      {!initialDocument && !globalProcessing && selectedFileIds.length === 0 && (
        <Center h='100%'>
          <Stack align="center" gap="md">
            <Text size="lg" c="dimmed">📄</Text>
            <Text c="dimmed">No PDF files loaded</Text>
            <Text size="sm" c="dimmed">Add files to start editing pages</Text>
          </Stack>
        </Center>
      )}

      {!initialDocument && globalProcessing && (
        <Box p={0}>
          <SkeletonLoader type="controls" />
          <SkeletonLoader type="pageGrid" count={8} />
        </Box>
      )}

      {displayDocument && (
        <Box ref={gridContainerRef} p={0} pt="2rem" pb="4rem" style={{ position: 'relative' }}>

            {/* Split Lines Overlay */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                pointerEvents: 'none',
                zIndex: 10
              }}
            >
            {(() => {
              const refsMap = gridItemRefsRef.current?.current;
              const containerEl = gridContainerRef.current;
              if (!refsMap || !containerEl) {
                return null;
              }

              const containerRect = containerEl.getBoundingClientRect();

              return Array.from(splitPositions).map((position) => {
                const currentPage = displayedPages[position];
                if (!currentPage) {
                  return null;
                }

                const currentEl = refsMap.get(currentPage.id);
                if (!currentEl) {
                  return null;
                }

                const currentRect = currentEl.getBoundingClientRect();
                const nextPage = displayedPages[position + 1];
                let lineLeft;

                if (nextPage) {
                  const nextEl = refsMap.get(nextPage.id);
                  if (nextEl) {
                    const nextRect = nextEl.getBoundingClientRect();
                    const sameRow = Math.abs(nextRect.top - currentRect.top) < currentRect.height / 2;
                    if (sameRow) {
                      lineLeft = (currentRect.right + nextRect.left) / 2;
                    } else {
                      lineLeft = currentRect.right + itemGapPx / 2;
                    }
                  } else {
                    lineLeft = currentRect.right + itemGapPx / 2;
                  }
                } else {
                  lineLeft = currentRect.right + itemGapPx / 2;
                }

                return (
                  <div
                    key={`split-${position}`}
                    style={{
                      position: 'absolute',
                      left: `${lineLeft - containerRect.left}px`,
                      top: `${currentRect.top - containerRect.top}px`,
                      width: '1px',
                      height: `${currentRect.height}px`,
                      borderLeft: '1px dashed #3b82f6',
                    }}
                  />
                );
              });
            })()}
          </div>

          {/* Pages Grid */}
          <DragDropGrid
            items={displayedPages}
            onReorderPages={handleReorderPages}
            zoomLevel={zoomLevel}
            selectedFileIds={selectedFileIds}
            onVisibleItemsChange={handleVisibleItemsChange}
            getThumbnailData={(pageId) => {
              const page = displayDocument.pages.find(p => p.id === pageId);
              if (!page?.thumbnail) return null;
              return {
                src: page.thumbnail,
                rotation: page.rotation || 0
              };
            }}
            renderItem={(page, index, refs, boxSelectedIds, clearBoxSelection, _getBoxSelection, _activeId, activeDragIds, justMoved, _isOver, dragHandleProps, zoomLevel) => {
              gridItemRefsRef.current = refs;
              const fileColorIndex = page.originalFileId ? fileColorIndexMap.get(page.originalFileId) ?? 0 : 0;
              const isBoxSelected = boxSelectedIds.includes(page.id);
              return (
                <PageThumbnail
                  key={page.id}
                  page={page}
                  index={index}
                  totalPages={displayDocument.pages.length}
                  fileColorIndex={fileColorIndex}
                  selectedPageIds={selectedPageIds}
                  selectionMode={selectionMode}
                  movingPage={movingPage}
                  isAnimating={isAnimating}
                  isBoxSelected={isBoxSelected}
                  clearBoxSelection={clearBoxSelection}
                  activeDragIds={activeDragIds}
                  justMoved={justMoved}
                  pageRefs={refs}
                  dragHandleProps={dragHandleProps}
                  onReorderPages={handleReorderPages}
                  onTogglePage={togglePage}
                  onAnimateReorder={animateReorder}
                  onExecuteCommand={executeCommand}
                  onSetStatus={() => {}}
                  onSetMovingPage={setMovingPage}
                  onDeletePage={handleDeletePage}
                  createRotateCommand={createRotateCommand}
                  createDeleteCommand={createDeleteCommand}
                  createSplitCommand={createSplitCommand}
                  pdfDocument={displayDocument}
                  setPdfDocument={setEditedDocument}
                  splitPositions={splitPositions}
                  onInsertFiles={handleInsertFiles}
                  zoomLevel={zoomLevel}
                />
              );
            }}
          />
        </Box>
      )}


      <NavigationWarningModal
        onApplyAndContinue={async () => {
          await applyChanges();
        }}
        onExportAndContinue={async () => {
          await onExportAll();
        }}
      />

    </div>
  );
};

export default PageEditor;
