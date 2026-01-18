import { useState, useCallback, useRef, useEffect, useMemo, useLayoutEffect } from "react";
import { Text, Center, Box, LoadingOverlay, Stack } from "@mantine/core";
import { useFileState, useFileActions } from "@app/contexts/FileContext";
import { useNavigationGuard, useNavigationState } from "@app/contexts/NavigationContext";
import { usePageEditor } from "@app/contexts/PageEditorContext";
import { PageEditorFunctions } from "@app/types/pageEditor";
// Thumbnail generation is now handled by individual PageThumbnail components
import '@app/components/pageEditor/PageEditor.module.css';
import PageThumbnail from '@app/components/pageEditor/PageThumbnail';
import DragDropGrid from '@app/components/pageEditor/DragDropGrid';
import SkeletonLoader from '@app/components/shared/SkeletonLoader';
import NavigationWarningModal from '@app/components/shared/NavigationWarningModal';
import { FileId } from "@app/types/file";
import { GRID_CONSTANTS } from '@app/components/pageEditor/constants';
import { PAGE_EDITOR_TRANSITION } from '@app/constants/animations';
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
  const { pageEditorTransition } = useNavigationState();

  // Get PageEditor coordination functions
  const { updateFileOrderFromPages, fileOrder, reorderedPages, clearReorderedPages, updateCurrentPages } = usePageEditor();

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
  const burstAnimatedPagesRef = useRef<Set<string>>(new Set());

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

  // Progressive page loading for smooth animation
  const [visiblePageCount, setVisiblePageCount] = useState(1);
  const [firstPageVisible, setFirstPageVisible] = useState(false);
  const [animatingPages, setAnimatingPages] = useState(false);
  const allPages = displayDocument?.pages || [];

  // Animation sequence coordination
  useEffect(() => {
    let cancelled = false;
    let fadeDelay: number | null = null;
    let remainingDelay: number | null = null;
    let glideListener: (() => void) | null = null;

    if (allPages.length <= 1) {
      setFirstPageVisible(true);
      setVisiblePageCount(allPages.length);
      return;
    }

    const waitForGlideCompletion = () => new Promise<void>((resolve) => {
      if (!pageEditorTransition?.isAnimating) {
        resolve();
        return;
      }

      let resolved = false;

      glideListener = () => {
        if (resolved) return;
        resolved = true;
        resolve();
      };

      window.addEventListener(PAGE_EDITOR_TRANSITION.GLIDE_COMPLETE_EVENT, glideListener, { once: true });

      const tick = () => {
        if (resolved) return;
        if (cancelled) {
          resolved = true;
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      };

      requestAnimationFrame(tick);
    });

    const runAnimation = async () => {
      await waitForGlideCompletion();
      if (cancelled) return;

      // Phase 2: Fade in first page (300ms)
      setFirstPageVisible(true);

      fadeDelay = window.setTimeout(() => {
        // Phase 3: Show first 20 pages for burst (or all if < 20)
        const burstPageCount = Math.min(20, allPages.length);
        setVisiblePageCount(burstPageCount);

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setAnimatingPages(true);
          });
        });

        // Phase 4: Load remaining pages without animation after burst completes
        if (allPages.length > 20) {
          remainingDelay = window.setTimeout(() => {
            setVisiblePageCount(allPages.length);
          }, 600); // After burst animation completes
        }
      }, 300);
    };

    runAnimation();

    return () => {
      cancelled = true;
      if (glideListener) {
        window.removeEventListener(PAGE_EDITOR_TRANSITION.GLIDE_COMPLETE_EVENT, glideListener);
      }
      if (fadeDelay !== null) clearTimeout(fadeDelay);
      if (remainingDelay !== null) clearTimeout(remainingDelay);
    };
  }, [allPages.length, pageEditorTransition?.isAnimating]);

  // Reset on document change
  useEffect(() => {
    setVisiblePageCount(1);
    setFirstPageVisible(false);
    setAnimatingPages(false);
    burstAnimatedPagesRef.current.clear();
  }, [allPages.length]);

  const displayedPages = allPages.slice(0, visiblePageCount);

  useLayoutEffect(() => {
    if (!animatingPages) {
      return;
    }

    const firstPageElement = document.querySelector('[data-page-number="1"]') as HTMLElement | null;
    if (!firstPageElement) {
      return;
    }

    const firstRect = firstPageElement.getBoundingClientRect();
    const burstLimit = Math.min(20, allPages.length);
    const pagesToAnimate = allPages.slice(1, Math.min(visiblePageCount, burstLimit));

    pagesToAnimate.forEach((page) => {
      if (burstAnimatedPagesRef.current.has(page.id)) {
        return;
      }

      const currentPageElement = document.querySelector(`[data-page-id="${page.id}"]`) as HTMLElement | null;
      if (!currentPageElement) {
        return;
      }

      const currentRect = currentPageElement.getBoundingClientRect();
      const deltaX = firstRect.left - currentRect.left;
      const deltaY = firstRect.top - currentRect.top;
      const scaleX = firstRect.width / currentRect.width;
      const scaleY = firstRect.height / currentRect.height;

      currentPageElement.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(${scaleX}, ${scaleY})`;
      currentPageElement.style.transformOrigin = 'top left';
      currentPageElement.style.opacity = '1';
      currentPageElement.style.transition = 'none';

      requestAnimationFrame(() => {
        currentPageElement.style.transform = 'translate(0, 0) scale(1)';
        currentPageElement.style.transition = 'transform 600ms cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 600ms cubic-bezier(0.25, 0.46, 0.45, 0.94)';
      });

      burstAnimatedPagesRef.current.add(page.id);
    });
  }, [animatingPages, allPages, visiblePageCount]);

  // Track color assignments by insertion order (files keep their color)
  const fileColorIndexMap = useFileColorMap(orderedFileIds);

  return (
    <Box
      ref={containerRef}
      pos="relative"
      data-scrolling-container="true"
      onMouseEnter={() => setIsContainerHovered(true)}
      onMouseLeave={() => setIsContainerHovered(false)}
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
        <Box ref={gridContainerRef} p={0} pt="2rem" pb="15rem" style={{ position: 'relative' }}>

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
              const isFirstPage = index === 0;
              const isSecondaryPage = index > 0;
              const pageStyle: React.CSSProperties = {};

              if (isFirstPage) {
                // Fade in first page after glide completes
                if (!firstPageVisible) {
                  pageStyle.opacity = 0;
                } else {
                  pageStyle.opacity = 1;
                  pageStyle.transition = 'opacity 300ms ease-in-out';
                }
                // Keep first page on top during burst
                pageStyle.zIndex = 10;
                pageStyle.position = 'relative';
              } else if (isSecondaryPage) {
                // Burst from behind the real first page
                if (!animatingPages) {
                  // Before animation: hide behind first page
                  // Use data attributes to calculate in useLayoutEffect
                  pageStyle.opacity = 0;
                  pageStyle.transition = 'none';
                  pageStyle.zIndex = -1;
                } else {
                  // Burst animation is applied once in useLayoutEffect
                  pageStyle.opacity = 1;
                  pageStyle.zIndex = 0;
                }
              }

              return (
                <div
                  data-page-id={page.id}
                  data-page-number={index + 1}
                  data-original-file-id={page.originalFileId}
                  style={pageStyle}
                >
                  <PageThumbnail
                    key={page.id}
                    page={page}
                    index={index}
                    totalPages={displayDocument.pages.length}
                    originalFile={(page as any).originalFileId ? selectors.getFile((page as any).originalFileId) : undefined}
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
                </div>
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

    </Box>
  );
};

export default PageEditor;
