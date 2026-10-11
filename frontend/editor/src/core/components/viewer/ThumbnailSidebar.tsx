import { useState, useEffect, useRef, useCallback, memo } from "react";
import { Box, ScrollArea, Text } from "@mantine/core";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Skeleton } from "@app/ui/Skeleton";
import { useTranslation } from "react-i18next";
import { useViewer } from "@app/contexts/ViewerContext";
import { PrivateContent } from "@app/components/shared/PrivateContent";
import { Icon } from "@app/ui/Icon";
import "@app/components/viewer/SidebarBase.css";

// Pages rendered beyond the visible window while scrolling the sidebar.
const OVERSCAN_PAGES = 6;
// Sidebar cards are small, so two device pixels per CSS pixel is plenty;
// anything higher only grows blobs without visible gain.
const THUMBNAIL_DPR_CAP = 2;

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
  registerCard: (pageIndex: number, el: HTMLDivElement | null) => void;
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
  registerCard,
}: ThumbnailCardProps) {
  return (
    <Box
      data-page-index={pageIndex}
      ref={(el) => registerCard(pageIndex, el)}
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

  // Visible sidebar window. Workers only render inside it (plus overscan)
  // and park otherwise, so opening a huge document no longer queues every
  // page up front. Stays null until the observer reports, or when the
  // observer is unavailable, and then the window falls back to the current
  // page plus overscan.
  const visibleRangeRef = useRef<{ min: number; max: number } | null>(null);
  const visibleSetRef = useRef<Set<number>>(new Set());
  const cardElsRef = useRef(new Map<number, HTMLDivElement>());
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const wakeResolversRef = useRef<Set<() => void>>(new Set());

  const wakeThumbnailWorkers = useCallback(() => {
    const resolvers = [...wakeResolversRef.current];
    wakeResolversRef.current.clear();
    resolvers.forEach((resolve) => resolve());
  }, []);

  useEffect(() => {
    currentPageRef.current = scrollState.currentPage - 1;
    // Without an observer the render window follows the current page, so a
    // page turn must wake parked workers; with one, the observer wakes them.
    if (visibleRangeRef.current === null) {
      wakeThumbnailWorkers();
    }
  }, [scrollState.currentPage, wakeThumbnailWorkers]);

  useEffect(() => {
    if (!visible) return;
    if (typeof IntersectionObserver === "undefined") {
      visibleRangeRef.current = null;
      wakeThumbnailWorkers();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const index = Number((entry.target as HTMLElement).dataset.pageIndex);
          if (Number.isNaN(index)) continue;
          if (entry.isIntersecting) {
            visibleSetRef.current.add(index);
          } else {
            visibleSetRef.current.delete(index);
          }
        }
        let min = Infinity;
        let max = -Infinity;
        visibleSetRef.current.forEach((i) => {
          if (i < min) min = i;
          if (i > max) max = i;
        });
        const next = visibleSetRef.current.size > 0 ? { min, max } : null;
        const prev = visibleRangeRef.current;
        if (
          (next === null) !== (prev === null) ||
          (next && prev && (next.min !== prev.min || next.max !== prev.max))
        ) {
          visibleRangeRef.current = next;
          wakeThumbnailWorkers();
        }
      },
      { root: viewportRef.current, threshold: 0 },
    );
    cardElsRef.current.forEach((el) => observer.observe(el));
    wakeThumbnailWorkers();
    return () => observer.disconnect();
  }, [visible, scrollState.totalPages, wakeThumbnailWorkers]);

  // Generate thumbnails when sidebar becomes visible
  useEffect(() => {
    if (!visible || scrollState.totalPages === 0) return;
    if (!thumbnailAPI) return;

    let isCancelled = false;
    // Sidebar cards are small; render at device pixels (capped) instead of
    // CSS pixels so thumbnails stay crisp on retina displays.
    const thumbDpr = Math.min(window.devicePixelRatio || 1, THUMBNAIL_DPR_CAP);

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
        const range = visibleRangeRef.current;
        const lo = range
          ? Math.max(0, range.min - OVERSCAN_PAGES)
          : Math.max(0, current - OVERSCAN_PAGES);
        const hi = range
          ? Math.min(totalPages - 1, range.max + OVERSCAN_PAGES)
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

        if (thumbnailsRef.current[pageIndex]) {
          await processNext();
          return;
        }

        try {
          const thumbTask = thumbnailAPI.renderThumb(pageIndex, thumbDpr);
          const thumbBlob = await thumbTask.toPromise();
          if (isCancelled) {
            return;
          }
          const thumbUrl = URL.createObjectURL(thumbBlob);

          setThumbnails((prev) => ({
            ...prev,
            [pageIndex]: thumbUrl,
          }));
        } catch (error) {
          console.error(
            "Failed to generate thumbnail for page",
            pageIndex + 1,
            error,
          );
          if (!isCancelled) {
            setThumbnails((prev) => ({
              ...prev,
              [pageIndex]: "error",
            }));
          }
        }

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
      wakeThumbnailWorkers();
    };
  }, [visible, scrollState.totalPages, thumbnailAPI, wakeThumbnailWorkers]);

  const handlePageClick = useCallback(
    (pageIndex: number) => {
      const pageNumber = pageIndex + 1; // Convert to 1-based
      scrollActions.scrollToPage(pageNumber);
    },
    [scrollActions],
  );

  const registerCard = useCallback(
    (pageIndex: number, el: HTMLDivElement | null) => {
      if (el) {
        cardElsRef.current.set(pageIndex, el);
      } else {
        cardElsRef.current.delete(pageIndex);
      }
    },
    [],
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
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                {Array.from(
                  { length: scrollState.totalPages },
                  (_, pageIndex) => (
                    <ThumbnailCard
                      key={pageIndex}
                      pageIndex={pageIndex}
                      thumbUrl={thumbnails[pageIndex]}
                      isCurrent={highlightPage === pageIndex + 1}
                      pageLabel={t(
                        "viewer.thumbnails.pageNumber",
                        "Page {{page}}",
                        {
                          page: pageIndex + 1,
                        },
                      )}
                      thumbAlt={t(
                        "viewer.thumbnails.thumbnailAlt",
                        "Page {{page}} thumbnail",
                        { page: pageIndex + 1 },
                      )}
                      failedLabel={t("viewer.thumbnails.failed", "Failed")}
                      onSelect={handlePageClick}
                      registerCard={registerCard}
                    />
                  ),
                )}
              </div>
            </Box>
          </ScrollArea>
        </Box>
      )}
    </>
  );
}
