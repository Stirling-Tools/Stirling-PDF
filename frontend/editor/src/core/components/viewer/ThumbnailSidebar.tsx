import { useState, useEffect, useRef, useCallback, memo } from "react";
import { Box, ScrollArea, Text } from "@mantine/core";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Skeleton } from "@app/ui/Skeleton";
import { useTranslation } from "react-i18next";
import { useViewer } from "@app/contexts/ViewerContext";
import {
  useActiveDocumentId,
  useDocumentReady,
} from "@app/components/viewer/useActiveDocumentId";
import { PrivateContent } from "@app/components/shared/PrivateContent";
import { Icon } from "@app/ui/Icon";
import "@app/components/viewer/SidebarBase.css";

// Pages rendered beyond the visible window while scrolling the sidebar.
const OVERSCAN_PAGES = 6;
// Measured per row once mounted; the estimate only sizes the scrollbar
// before the first measurement lands.
const THUMB_CARD_ESTIMATE_PX = 282;
// Sidebar cards are small, so two device pixels per CSS pixel is plenty;
// anything higher only grows blobs without visible gain.
const THUMBNAIL_DPR_CAP = 2;
// Finished renders wait here instead of committing one parent-list render
// per thumbnail; the buffer flushes on a short timer or when full.
const THUMB_COMMIT_BATCH_SIZE = 8;
const THUMB_COMMIT_FLUSH_MS = 120;

interface ThumbnailSidebarProps {
  visible: boolean;
  onToggle: () => void;
  activeFileId?: string | null;
}

interface ThumbnailCardProps {
  pageIndex: number;
  thumbUrl?: string;
  isCurrent: boolean;
  pageLabel: string;
  thumbAlt: string;
  failedLabel: string;
  onSelect: (pageIndex: number) => void;
}

// One sidebar row. Memoized so a completed thumbnail re-renders its own row
// instead of the whole page list.
const ThumbnailCard = memo(function ThumbnailCard({
  pageIndex,
  thumbUrl,
  isCurrent,
  pageLabel,
  thumbAlt,
  failedLabel,
  onSelect,
}: ThumbnailCardProps) {
  return (
    <Box
      data-page-index={pageIndex}
      onClick={() => onSelect(pageIndex)}
      style={{
        cursor: "pointer",
        borderRadius: "8px",
        padding: "8px",
        backgroundColor: isCurrent ? "var(--color-primary-100)" : "transparent",
        border: isCurrent
          ? "2px solid var(--color-primary-500)"
          : "2px solid transparent",
        transition: "all 0.2s ease",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "8px",
        contentVisibility: "auto",
        containIntrinsicSize: "auto 11.5rem auto 16.5rem",
      }}
      onMouseEnter={(e) => {
        if (!isCurrent) {
          e.currentTarget.style.backgroundColor = "var(--c-hover)";
        }
      }}
      onMouseLeave={(e) => {
        if (!isCurrent) {
          e.currentTarget.style.backgroundColor = "transparent";
        }
      }}
    >
      {/* Thumbnail Image */}
      {thumbUrl && thumbUrl !== "error" ? (
        <PrivateContent>
          <img
            src={thumbUrl}
            alt={thumbAlt}
            style={{
              maxWidth: "100%",
              height: "auto",
              borderRadius: "4px",
              boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
              border: "1px solid var(--c-border-subtle)",
            }}
          />
        </PrivateContent>
      ) : thumbUrl === "error" ? (
        <div
          style={{
            width: "11.5rem",
            height: "15rem",
            backgroundColor: "var(--color-red-50)",
            border: "1px solid var(--color-red-200)",
            borderRadius: "4px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--color-red-500)",
            fontSize: "12px",
          }}
        >
          {failedLabel}
        </div>
      ) : (
        <Skeleton
          shape="rect"
          width="11.5rem"
          height="15rem"
          className="thumbnail-sidebar-skeleton"
        />
      )}

      {/* Page Number */}
      <div
        style={{
          fontSize: "12px",
          fontWeight: 500,
          color: isCurrent
            ? "var(--color-primary-500)"
            : "var(--c-text-subtle)",
        }}
      >
        {pageLabel}
      </div>
    </Box>
  );
});

export function ThumbnailSidebar({
  visible,
  onToggle,
  activeFileId,
}: ThumbnailSidebarProps) {
  const { t } = useTranslation();
  const {
    getScrollState,
    scrollActions,
    getThumbnailAPI,
    registerImmediateScrollUpdate,
  } = useViewer();
  const [thumbnails, setThumbnails] = useState<{ [key: number]: string }>({});

  const scrollState = getScrollState();
  const thumbnailAPI = getThumbnailAPI();
  const pluginDocumentId = useActiveDocumentId();
  const documentReady = useDocumentReady();

  // Highlight follows page turns through the immediate notifier, not through
  // parent re-renders, so batching thumbnail commits cannot leave it stale.
  const [highlightPage, setHighlightPage] = useState(scrollState.currentPage);
  useEffect(() => {
    setHighlightPage(scrollState.currentPage);
    const unregister = registerImmediateScrollUpdate?.((page: number) => {
      setHighlightPage(page);
    });
    return () => {
      unregister?.();
    };
  }, [registerImmediateScrollUpdate, scrollState.currentPage]);

  // Clear thumbnails when active file changes
  useEffect(() => {
    // Revoke old blob URLs to prevent memory leaks
    Object.values(thumbnails).forEach((thumbUrl) => {
      if (typeof thumbUrl === "string" && thumbUrl.startsWith("blob:")) {
        URL.revokeObjectURL(thumbUrl);
      }
    });
    setThumbnails({});
  }, [activeFileId]);

  // Keep a ref to thumbnails for cleanup on unmount
  const thumbnailsRef = useRef(thumbnails);
  useEffect(() => {
    thumbnailsRef.current = thumbnails;
  }, [thumbnails]);

  // Clear thumbnails when sidebar closes and revoke blob URLs to prevent memory leaks
  useEffect(() => {
    if (!visible) {
      Object.values(thumbnailsRef.current).forEach((thumbUrl) => {
        // Only revoke if it's a blob URL (not 'error')
        if (typeof thumbUrl === "string" && thumbUrl.startsWith("blob:")) {
          URL.revokeObjectURL(thumbUrl);
        }
      });
      setThumbnails({});
    }
  }, [visible]);

  // Cleanup all blob URLs on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      Object.values(thumbnailsRef.current).forEach((thumbUrl) => {
        if (typeof thumbUrl === "string" && thumbUrl.startsWith("blob:")) {
          URL.revokeObjectURL(thumbUrl);
        }
      });
    };
  }, []);

  const currentPageRef = useRef(scrollState.currentPage - 1);

  // Render window for the worker queue. The virtual list reports it; without
  // layout (tests) it stays null and generation falls back to the current
  // page plus overscan.
  const renderRangeRef = useRef<{ min: number; max: number } | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const wakeResolversRef = useRef<Set<() => void>>(new Set());

  const wakeThumbnailWorkers = useCallback(() => {
    const resolvers = [...wakeResolversRef.current];
    wakeResolversRef.current.clear();
    resolvers.forEach((resolve) => resolve());
  }, []);

  // The virtualizer only measures once the scroll viewport exists and has
  // height, which is never true without layout, so tests keep the full list.
  const [viewportMounted, setViewportMounted] = useState(false);
  useEffect(() => {
    setViewportMounted(viewportRef.current !== null);
  }, [visible]);

  const scrollViewport =
    viewportMounted && (viewportRef.current?.clientHeight ?? 0) > 0
      ? viewportRef.current
      : null;

  const rowVirtualizer = useVirtualizer({
    count: scrollState.totalPages,
    getScrollElement: () => viewportRef.current,
    estimateSize: () => THUMB_CARD_ESTIMATE_PX,
    overscan: OVERSCAN_PAGES,
    gap: 12,
  });

  const virtualItems = scrollViewport ? rowVirtualizer.getVirtualItems() : [];
  const rangeMin = virtualItems.length > 0 ? virtualItems[0].index : -1;
  const rangeMax =
    virtualItems.length > 0 ? virtualItems[virtualItems.length - 1].index : -1;

  useEffect(() => {
    if (!visible) return;
    const next =
      rangeMin >= 0 && rangeMax >= 0 ? { min: rangeMin, max: rangeMax } : null;
    const prev = renderRangeRef.current;
    renderRangeRef.current = next;
    if (
      (next === null) !== (prev === null) ||
      (next && prev && (next.min !== prev.min || next.max !== prev.max))
    ) {
      wakeThumbnailWorkers();
    }
  }, [visible, rangeMin, rangeMax, wakeThumbnailWorkers]);

  useEffect(() => {
    currentPageRef.current = scrollState.currentPage - 1;
    // Without a render window the queue follows the current page, so a page
    // turn must wake parked workers; with one, range changes wake them.
    if (renderRangeRef.current === null) {
      wakeThumbnailWorkers();
    }
  }, [scrollState.currentPage, wakeThumbnailWorkers]);

  // Generate thumbnails when sidebar becomes visible
  useEffect(() => {
    if (!visible || scrollState.totalPages === 0) return;
    if (!thumbnailAPI) return;
    // Bind this generation run to the plugin document that is actually
    // loaded. The viewer tree persists across file switches without
    // remounting, so without this gate stale workers would commit the old
    // document's blobs into the new file's state (or never restart and leave
    // skeletons). The scoped API pins every render to that document instead
    // of the plugin's mutable active-document fallback.
    if (!pluginDocumentId || !documentReady) return;

    let isCancelled = false;
    const genDocId = pluginDocumentId;
    const scopedAPI = thumbnailAPI.forDocument(genDocId);
    // Sidebar cards are small; render at device pixels (capped) instead of
    // CSS pixels so thumbnails stay crisp on retina displays.
    const thumbDpr = Math.min(window.devicePixelRatio || 1, THUMBNAIL_DPR_CAP);

    // Finished renders wait in this buffer and flush into state together, so
    // rapid completions cost one list reconciliation instead of one each.
    // Everything here is generation-local: cancel clears the buffer and the
    // timer, so a stale flush can never commit after unmount or file change.
    const commitBuffer = new Map<number, string>();
    let commitTimer: ReturnType<typeof setTimeout> | null = null;

    const flushCommits = () => {
      commitTimer = null;
      if (isCancelled || commitBuffer.size === 0) return;
      const batch = [...commitBuffer];
      commitBuffer.clear();
      setThumbnails((prev) => {
        const next = { ...prev };
        for (const [pageIndex, thumbUrl] of batch) {
          next[pageIndex] = thumbUrl;
        }
        return next;
      });
    };

    const stageCommit = (pageIndex: number, thumbUrl: string) => {
      commitBuffer.set(pageIndex, thumbUrl);
      if (commitBuffer.size >= THUMB_COMMIT_BATCH_SIZE) {
        if (commitTimer !== null) {
          clearTimeout(commitTimer);
        }
        flushCommits();
      } else if (commitTimer === null) {
        commitTimer = setTimeout(flushCommits, THUMB_COMMIT_FLUSH_MS);
      }
    };

    // One paint opportunity between renders so thumbnail work never holds
    // the main thread across frames while the user scrolls the document.
    const yieldToPaint = () =>
      new Promise<void>((resolve) => {
        if (typeof requestAnimationFrame === "function") {
          requestAnimationFrame(() => resolve());
        } else {
          setTimeout(resolve, 0);
        }
      });

    const waitForVisibleWork = () =>
      new Promise<void>((resolve) => {
        wakeResolversRef.current.add(resolve);
      });

    const generateThumbnails = async () => {
      const totalPages = scrollState.totalPages;
      const pending = new Set(Array.from({ length: totalPages }, (_, i) => i));

      const getNextPageIndex = () => {
        if (pending.size === 0) return null;
        const current = Math.max(
          0,
          Math.min(totalPages - 1, currentPageRef.current),
        );
        const range = renderRangeRef.current;
        // The virtual window already includes overscan; the fallback window
        // is the current page plus overscan.
        const lo = range ? range.min : Math.max(0, current - OVERSCAN_PAGES);
        const hi = range
          ? range.max
          : Math.min(totalPages - 1, current + OVERSCAN_PAGES);

        // Outward expansion from the current page, clamped to the visible
        // window: pages the user cannot see yet are not rendered.
        let left = Math.max(lo, Math.min(current, hi));
        let right = left + 1;
        while (left >= lo || right <= hi) {
          if (left >= lo && pending.has(left)) {
            pending.delete(left);
            return left;
          }
          if (right <= hi && pending.has(right)) {
            pending.delete(right);
            return right;
          }
          left--;
          right++;
        }
        return null;
      };

      const CONCURRENCY_LIMIT = 3;

      const processNext = async () => {
        if (isCancelled) return;
        let pageIndex = getNextPageIndex();
        while (pageIndex === null && !isCancelled) {
          if (pending.size === 0) return;
          // Visible window is fully rendered; park until scrolling wakes us.
          await waitForVisibleWork();
          if (isCancelled) return;
          pageIndex = getNextPageIndex();
        }
        if (isCancelled || pageIndex === null) return;

        if (thumbnailsRef.current[pageIndex] || commitBuffer.has(pageIndex)) {
          await processNext();
          return;
        }

        try {
          const thumbTask = scopedAPI.renderThumb(pageIndex, thumbDpr);
          const thumbBlob = await thumbTask.toPromise();
          if (isCancelled) {
            return;
          }
          const thumbUrl = URL.createObjectURL(thumbBlob);

          stageCommit(pageIndex, thumbUrl);
        } catch (error) {
          console.error(
            "Failed to generate thumbnail for page",
            pageIndex + 1,
            error,
          );
          if (!isCancelled) {
            stageCommit(pageIndex, "error");
          }
        }

        await yieldToPaint();
        await processNext();
      };

      // Start initial concurrent batch
      const workers = Array.from({ length: CONCURRENCY_LIMIT }, () =>
        processNext(),
      );
      await Promise.all(workers);
    };

    generateThumbnails();

    return () => {
      isCancelled = true;
      if (commitTimer !== null) {
        clearTimeout(commitTimer);
        commitTimer = null;
      }
      commitBuffer.clear();
      wakeThumbnailWorkers();
    };
  }, [
    visible,
    scrollState.totalPages,
    thumbnailAPI,
    wakeThumbnailWorkers,
    activeFileId,
    pluginDocumentId,
    documentReady,
  ]);

  const handlePageClick = useCallback(
    (pageIndex: number) => {
      const pageNumber = pageIndex + 1; // Convert to 1-based
      scrollActions.scrollToPage(pageNumber);
    },
    [scrollActions],
  );

  // One renderer for both list modes so the virtual and fallback lists
  // cannot drift apart.
  const renderCard = useCallback(
    (pageIndex: number) => (
      <ThumbnailCard
        key={pageIndex}
        pageIndex={pageIndex}
        thumbUrl={thumbnails[pageIndex]}
        isCurrent={highlightPage === pageIndex + 1}
        pageLabel={t("viewer.thumbnails.pageNumber", "Page {{page}}", {
          page: pageIndex + 1,
        })}
        thumbAlt={t(
          "viewer.thumbnails.thumbnailAlt",
          "Page {{page}} thumbnail",
          { page: pageIndex + 1 },
        )}
        failedLabel={t("viewer.thumbnails.failed", "Failed")}
        onSelect={handlePageClick}
      />
    ),
    [thumbnails, highlightPage, t, handlePageClick],
  );

  return (
    <>
      {/* Thumbnail Sidebar */}
      {visible && (
        <Box
          className="sidebar-base"
          style={{
            position: "fixed",
            right: 0,
            top: 0,
            bottom: 0,
            width: "15rem",
            zIndex: 998,
          }}
        >
          <div className="sidebar-base__header">
            <div className="sidebar-base__header-title">
              <span className="sidebar-base__header-icon">
                <Icon name="list" size={20} />
              </span>
              <Text
                fw={600}
                size="sm"
                tt="uppercase"
                lts={0.5}
                style={{ flex: 1 }}
              >
                {t("viewer.thumbnails.title", "Pages")}
              </Text>
            </div>
            <ActionIcon
              variant="tertiary"
              accent="neutral"
              size="sm"
              onClick={onToggle}
              aria-label={t(
                "viewer.thumbnails.closeSidebar",
                "Close thumbnails sidebar",
              )}
              title={t(
                "viewer.thumbnails.closeSidebar",
                "Close thumbnails sidebar",
              )}
            >
              <Icon name="x" size="1.1rem" />
            </ActionIcon>
          </div>
          {/* Thumbnails Container */}
          <ScrollArea viewportRef={viewportRef} style={{ flex: 1 }}>
            <Box p="sm">
              {scrollViewport ? (
                // Virtualized: only the visible window plus overscan mounts,
                // so a huge document costs a dozen cards instead of thousands.
                <div
                  style={{
                    position: "relative",
                    height: `${rowVirtualizer.getTotalSize()}px`,
                  }}
                >
                  {virtualItems.map((item) => (
                    <div
                      key={item.key}
                      data-page-index={item.index}
                      ref={rowVirtualizer.measureElement}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        transform: `translateY(${item.start}px)`,
                      }}
                    >
                      {renderCard(item.index)}
                    </div>
                  ))}
                </div>
              ) : (
                // No layout (tests): the virtualizer cannot measure, so every
                // card mounts exactly as before.
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                  }}
                >
                  {Array.from(
                    { length: scrollState.totalPages },
                    (_, pageIndex) => renderCard(pageIndex),
                  )}
                </div>
              )}
            </Box>
          </ScrollArea>
        </Box>
      )}
    </>
  );
}
