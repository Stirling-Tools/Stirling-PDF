import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { Box } from '@mantine/core';
import Viewer from '@app/components/viewer/Viewer';
import { useFileState } from '@app/contexts/FileContext';
import { useSidebarContext } from '@app/contexts/SidebarContext';
import { useViewer } from '@app/contexts/ViewerContext';
import { useProgressivePagePreviews } from '@app/hooks/useProgressivePagePreviews';
import TopControls from '@app/components/shared/TopControls';
import type { FileId } from '@app/types/file';
import type { StirlingFileStub } from '@app/types/fileContext';
import type { WorkbenchType } from '@app/types/workbench';
import styles from '@app/components/layout/FileStackView.module.css';

interface FileStackViewProps {
  files: StirlingFileStub[];
}

const DEFAULT_PAGE_ASPECT_RATIO = 8.5 / 11;

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface PagePreviewMeta {
  pageNumber: number;
  url: string;
  width: number;
  height: number;
}

interface PageClickPayload {
  pageIndex: number;
  rect: Rect;
  pagePreview?: PagePreviewMeta;
}

interface ViewerInitialPageRequest {
  requestId: string;
  fileId?: FileId | null;
  pageIndex: number;
  zoomPercent?: number;
}

interface ViewerTransitionState {
  id: string;
  startRect: Rect;
  targetRect: Rect;
  preview?: {
    url?: string;
    aspectRatio: number;
  };
}

export default function FileStackView({ files }: FileStackViewProps) {
  const { selectors } = useFileState();
  const { sidebarState, setSidebarsVisible } = useSidebarContext();
  const { activeFileIndex, setActiveFileIndex } = useViewer();
  const [expandedFileId, setExpandedFileId] = useState<FileId | null>(null);
  const [viewerStage, setViewerStage] = useState<'closed' | 'animating' | 'open'>('closed');
  const [viewerInitialPage, setViewerInitialPage] = useState<ViewerInitialPageRequest | null>(null);
  const [transitionState, setTransitionState] = useState<ViewerTransitionState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Calculate responsive grid columns
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (viewerStage !== 'open' || !transitionState) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setTransitionState(null);
    }, 200);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [viewerStage, transitionState]);

  // Get actual File object for rendering
  const getFile = useCallback((fileId: FileId) => {
    return selectors.getFile(fileId);
  }, [selectors]);

  // Handle file click - toggle expansion
  const handleFileClick = useCallback((fileId: FileId) => {
    setExpandedFileId(prev => prev === fileId ? null : fileId);
  }, []);

  // Handle page click - start transition into viewer
  const handlePageClick = useCallback((fileId: FileId, payload: PageClickPayload) => {
    const { pageIndex, pagePreview, rect } = payload;
    const timestamp = Date.now();
    const transitionId = `${fileId}-${pageIndex}-${timestamp}`;

    const container = containerRef.current;
    const containerRect = container?.getBoundingClientRect();

    let relativeStart = rect;
    let targetRect: Rect | null = null;

    if (container && containerRect) {
      const styles = window.getComputedStyle(container);
      const paddingTop = parseFloat(styles.paddingTop) || 0;
      const paddingBottom = parseFloat(styles.paddingBottom) || 0;
      const paddingLeft = parseFloat(styles.paddingLeft) || 0;
      const paddingRight = parseFloat(styles.paddingRight) || 0;
      const scrollTop = container.scrollTop;
      const scrollLeft = container.scrollLeft;

      relativeStart = {
        top: rect.top - containerRect.top + scrollTop,
        left: rect.left - containerRect.left + scrollLeft,
        width: rect.width,
        height: rect.height,
      };

      targetRect = {
        top: paddingTop + scrollTop,
        left: paddingLeft + scrollLeft,
        width: container.clientWidth - paddingLeft - paddingRight,
        height: container.clientHeight - paddingTop - paddingBottom,
      };
    }

    const fallbackTarget: Rect = {
      top: 0,
      left: 0,
      width: rect.width,
      height: rect.height,
    };

    const target = targetRect ?? fallbackTarget;
    const previewAspectRatio = pagePreview
      ? pagePreview.width / pagePreview.height
      : DEFAULT_PAGE_ASPECT_RATIO;

    const fittedRect = (() => {
      if (!pagePreview || pagePreview.height === 0 || target.height === 0) {
        return { width: target.width, height: target.height };
      }
      const scaleByWidth = target.width / pagePreview.width;
      const projectedHeight = pagePreview.height * scaleByWidth;
      if (projectedHeight <= target.height) {
        return { width: target.width, height: projectedHeight };
      }
      const scaleByHeight = target.height / pagePreview.height;
      return { width: pagePreview.width * scaleByHeight, height: target.height };
    })();

    setTransitionState({
      id: transitionId,
      startRect: relativeStart,
      targetRect: {
        top: target.top + (target.height - fittedRect.height) / 2,
        left: target.left + (target.width - fittedRect.width) / 2,
        width: fittedRect.width,
        height: fittedRect.height,
      },
      preview: {
        url: pagePreview?.url,
        aspectRatio: previewAspectRatio,
      },
    });

    const zoomPercent = 100;

    setViewerInitialPage({
      fileId,
      pageIndex,
      zoomPercent,
      requestId: transitionId,
    });

    const toIndex = files.findIndex(f => f.id === fileId);
    if (toIndex >= 0) {
      setActiveFileIndex(toIndex);
    }

    setViewerStage('animating');
  }, [files, setActiveFileIndex]);

  const handleViewerClose = useCallback(() => {
    setViewerStage('closed');
    setViewerInitialPage(null);
    setTransitionState(null);
  }, []);

  const handleTopControlsViewChange = useCallback((view: WorkbenchType) => {
    if (view === 'fileEditor') {
      handleViewerClose();
    }
  }, [handleViewerClose]);

  const topControlsFiles = useMemo(() => files.map(file => ({
    fileId: file.id,
    name: file.name,
    versionNumber: file.versionNumber,
  })), [files]);

  const isViewerOpen = viewerStage === 'open';
  const isAnimating = viewerStage === 'animating';
  const showTopControls = viewerStage !== 'closed';
  const topControlsView: WorkbenchType = isViewerOpen ? 'viewer' : 'fileEditor';

  return (
    <Box className={styles.container} ref={containerRef}>
      <AnimatePresence>
        {showTopControls && (
          <motion.div
            className={styles.topControlsHost}
            initial={{ y: -40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -40, opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <TopControls
              allowedViews={['viewer', 'fileEditor']}
              currentView={topControlsView}
              setCurrentView={handleTopControlsViewChange}
              activeFiles={topControlsFiles}
              currentFileIndex={activeFileIndex}
              onFileSelect={setActiveFileIndex}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {!isViewerOpen ? (
        <LayoutGroup>
          <motion.div
            className={styles.gridContainer}
            style={{
              gridTemplateColumns: `repeat(auto-fill, minmax(280px, 1fr))`,
              opacity: isAnimating ? 0.12 : 1,
              pointerEvents: isAnimating ? 'none' : 'auto',
              filter: isAnimating ? 'blur(2px)' : 'none',
              transition: 'opacity 0.3s ease, filter 0.3s ease',
            }}
          >
            {files.map((file) => {
              const fileObj = getFile(file.id);
              const isExpanded = expandedFileId === file.id;
              const totalPages = file.processedFile?.totalPages || file.processedFile?.pages?.length || 1;
              
              return (
                <React.Fragment key={file.id}>
                  <FileCard
                    file={file}
                    isExpanded={isExpanded}
                    totalPages={totalPages}
                    onFileClick={() => handleFileClick(file.id)}
                  />
                  {isExpanded && fileObj && (
                    <FilePagesProvider
                      key={`pages-${file.id}`}
                      file={file}
                      fileObj={fileObj}
                    >
                      {({ pages, totalPages: loadedTotalPages }) => {
                        const actualTotalPages = loadedTotalPages || totalPages;
                        return (
                          <>
                            {Array.from({ length: actualTotalPages }, (_, pageIndex) => {
                              const pagePreview = pages.find(p => p.pageNumber === pageIndex + 1);
                              return (
                                <ExpandedPageCard
                                  key={`${file.id}-page-${pageIndex}`}
                                  pageIndex={pageIndex}
                                  pagePreview={pagePreview ? {
                                    pageNumber: pagePreview.pageNumber,
                                    url: pagePreview.url,
                                    width: pagePreview.width,
                                    height: pagePreview.height,
                                  } : undefined}
                                  onPageClick={(payload) => handlePageClick(file.id, payload)}
                                />
                              );
                            })}
                          </>
                        );
                      }}
                    </FilePagesProvider>
                  )}
                </React.Fragment>
              );
            })}
          </motion.div>
        </LayoutGroup>
      ) : (
        <div className={styles.viewerMount}>
          <Viewer
            sidebarsVisible={sidebarState.sidebarsVisible}
            setSidebarsVisible={setSidebarsVisible}
            onClose={handleViewerClose}
            activeFileIndex={activeFileIndex}
            setActiveFileIndex={setActiveFileIndex}
            initialPage={viewerInitialPage ?? undefined}
          />
        </div>
      )}

      <AnimatePresence>
        {transitionState && (
          <motion.div
            key={transitionState.id}
            className={styles.transitionOverlay}
            initial={{
              top: transitionState.startRect.top,
              left: transitionState.startRect.left,
              width: transitionState.startRect.width,
              height: transitionState.startRect.height,
              opacity: 1,
            }}
            animate={{
              top: transitionState.targetRect.top,
              left: transitionState.targetRect.left,
              width: transitionState.targetRect.width,
              height: transitionState.targetRect.height,
              opacity: viewerStage === 'animating' ? 1 : 0,
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            style={{ position: 'absolute', zIndex: 5, pointerEvents: 'none' }}
            onAnimationComplete={() => {
              setViewerStage(prev => (prev === 'animating' ? 'open' : prev));
            }}
          >
            <div
              className={styles.transitionContent}
              style={{
                aspectRatio: `${transitionState.preview?.aspectRatio ?? DEFAULT_PAGE_ASPECT_RATIO}`,
              }}
            >
              {transitionState.preview?.url ? (
                <img
                  src={transitionState.preview.url}
                  alt="Selected page preview"
                  className={styles.transitionImage}
                />
              ) : (
                <div className={styles.transitionPlaceholder}>
                  <div className={styles.loadingSpinner} />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </Box>
  );
}

interface FileCardProps {
  file: StirlingFileStub;
  isExpanded: boolean;
  totalPages: number;
  onFileClick: () => void;
}

function FileCard({
  file,
  isExpanded,
  totalPages,
  onFileClick,
}: FileCardProps) {
  return (
    <motion.div
      layout
      className={styles.fileCard}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      whileHover={{ scale: 1.02 }}
      onClick={onFileClick}
    >
      <div className={styles.fileCardContent}>
        <div className={styles.fileCardHeader}>
          <h3 className={styles.fileTitle}>{file.name}</h3>
          <span className={styles.pageCount}>{totalPages} {totalPages === 1 ? 'page' : 'pages'}</span>
        </div>
        {file.thumbnailUrl && (
          <img 
            src={file.thumbnailUrl} 
            alt={file.name}
            className={styles.fileThumbnail}
          />
        )}
        {isExpanded && (
          <div className={styles.expandedIndicator}>▼ Expanded</div>
        )}
      </div>
    </motion.div>
  );
}

// Shared page data provider for a file - loads all pages once
function FilePagesProvider({
  file,
  fileObj,
  children
}: {
  file: StirlingFileStub;
  fileObj: File;
  children: (data: { pages: PagePreviewMeta[]; totalPages: number }) => React.ReactNode;
}) {
  // Use state for cacheKey so React tracks changes
  const [cacheKey, setCacheKey] = useState(() => Date.now());
  const [visibleRange, setVisibleRange] = useState<{ start: number; end: number } | undefined>(undefined);
  const hasSetRangeRef = useRef(false);
  
  // Reset when file changes
  useEffect(() => {
    setCacheKey(Date.now());
    hasSetRangeRef.current = false;
    setVisibleRange(undefined);
  }, [file.id]);
  
  const { pages, totalPages } = useProgressivePagePreviews({
    file: fileObj,
    enabled: true,
    cacheKey,
    visiblePageRange: visibleRange,
  });

  // Once we know totalPages, trigger loading of all pages (only once)
  useEffect(() => {
    if (totalPages > 0 && !hasSetRangeRef.current) {
      hasSetRangeRef.current = true;
      // Set visible range to load all pages
      const range = { start: 0, end: totalPages - 1 };
      setVisibleRange(range);
    }
  }, [totalPages]);

  return <>{children({ pages, totalPages })}</>;
}

interface ExpandedPageCardProps {
  pageIndex: number;
  pagePreview?: PagePreviewMeta;
  onPageClick: (payload: PageClickPayload) => void;
}

function ExpandedPageCard({ pageIndex, pagePreview, onPageClick }: ExpandedPageCardProps) {
  const aspectRatio = pagePreview
    ? pagePreview.width / pagePreview.height
    : DEFAULT_PAGE_ASPECT_RATIO;

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const domRect = event.currentTarget.getBoundingClientRect();
    onPageClick({
      pageIndex,
      pagePreview,
      rect: {
        top: domRect.top,
        left: domRect.left,
        width: domRect.width,
        height: domRect.height,
      },
    });
  };

  return (
    <motion.div
      className={styles.pageCard}
      initial={{ opacity: 0, scale: 0.8, x: -20 }}
      animate={{ opacity: 1, scale: 1, x: 0 }}
      exit={{ opacity: 0, scale: 0.8, x: -20 }}
      transition={{
        duration: 0.4,
        delay: pageIndex * 0.05,
        ease: [0.25, 0.1, 0.25, 1],
      }}
      whileHover={{ scale: 1.05 }}
      onClick={handleClick}
      layout={false}
    >
      {pagePreview ? (
        <img
          src={pagePreview.url}
          alt={`Page ${pageIndex + 1}`}
          className={styles.pageImage}
          style={{
            aspectRatio: aspectRatio.toString(),
          }}
        />
      ) : (
        <div 
          className={styles.pagePlaceholder}
          style={{
            aspectRatio: aspectRatio.toString(),
          }}
        >
          <div className={styles.loadingSpinner} />
        </div>
      )}
      <div className={styles.pageNumber}>Page {pageIndex + 1}</div>
    </motion.div>
  );
}

// Full-screen page viewer with vertical scrolling
