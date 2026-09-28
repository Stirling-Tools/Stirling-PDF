import { useCallback, useEffect, useRef, useState } from "react";
import { Box, ScrollArea, Text } from "@mantine/core";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Skeleton } from "@app/ui/Skeleton";
import { useTranslation } from "react-i18next";
import { useViewer } from "@app/contexts/ViewerContext";
import { PrivateContent } from "@app/components/shared/PrivateContent";
import { Icon } from "@app/ui/Icon";
import "@app/components/viewer/SidebarBase.css";

// Window math only: rows keep their natural height, but the scrollbar and the
// mounted range need one number. Letter-sized rows land near this.
const ROW_HEIGHT_PX = 372;
const WINDOW_OVERSCAN = 3;
// Keep a bounded runway around the window so short scrolls do not regenerate;
// anything outside loses its blob URL so decode/bitmap memory stays bounded.
const CACHE_RADIUS = 12;
const GENERATE_CONCURRENCY = 3;

interface ThumbnailSidebarProps {
  visible: boolean;
  onToggle: () => void;
  activeFileId?: string | null;
}

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
  const [windowRange, setWindowRange] = useState({ start: 0, end: 1 });

  const scrollState = getScrollState();
  const thumbnailAPI = getThumbnailAPI();

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
  const generatedFileRef = useRef<string | null | undefined>(undefined);
  const viewportRef = useRef<HTMLDivElement>(null);

  const updateWindowRange = useCallback(() => {
    const totalPages = scrollState.totalPages;
    const viewport = viewportRef.current;
    const viewportHeight = viewport?.clientHeight || 800;
    const scrollTop = viewport?.scrollTop ?? 0;
    const firstVisible = Math.floor(scrollTop / ROW_HEIGHT_PX);
    const visibleRows = Math.ceil(viewportHeight / ROW_HEIGHT_PX);
    const start = Math.max(0, firstVisible - WINDOW_OVERSCAN);
    const end = Math.min(
      totalPages,
      start + visibleRows + WINDOW_OVERSCAN * 2 + 1,
    );
    setWindowRange((prev) =>
      prev.start === start && prev.end === end ? prev : { start, end },
    );
  }, [scrollState.totalPages]);

  // Clear thumbnails when sidebar closes and revoke blob URLs to prevent memory leaks
  useEffect(() => {
    if (!visible) {
      Object.values(thumbnailsRef.current).forEach((thumbUrl) => {
        // Only revoke if it's a blob URL (not 'error')
        if (typeof thumbUrl === "string" && thumbUrl.startsWith("blob:")) {
          URL.revokeObjectURL(thumbUrl);
        }
      });
      thumbnailsRef.current = {};
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
  // Scroll updates arrive through the immediate notifier, not through
  // re-renders, so the nearest-page pick tracks the page from the
  // subscription instead of the value captured at mount.
  useEffect(() => {
    return registerImmediateScrollUpdate((currentPage) => {
      currentPageRef.current = currentPage - 1;
    });
  }, [registerImmediateScrollUpdate]);

  useEffect(() => {
    if (!visible) return;
    const viewport = viewportRef.current;
    updateWindowRange();
    if (!viewport) return;
    const handleScroll = () => updateWindowRange();
    viewport.addEventListener("scroll", handleScroll, { passive: true });
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => updateWindowRange());
    resizeObserver?.observe(viewport);
    window.addEventListener("resize", updateWindowRange);
    return () => {
      viewport.removeEventListener("scroll", handleScroll);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateWindowRange);
    };
  }, [visible, updateWindowRange]);

  // Generate only what the window (plus its cache runway) can use.
  useEffect(() => {
    if (!visible || scrollState.totalPages === 0) return;
    if (!thumbnailAPI) return;

    // A file switch revokes the previous thumbnails; drop the ref too, or the
    // new file's pages are skipped as already rendered.
    if (generatedFileRef.current !== activeFileId) {
      thumbnailsRef.current = {};
      generatedFileRef.current = activeFileId;
    }

    let isCancelled = false;

    const cacheStart = Math.max(0, windowRange.start - CACHE_RADIUS);
    const cacheEnd = Math.min(
      scrollState.totalPages,
      windowRange.end + CACHE_RADIUS,
    );

    const evicted = Object.keys(thumbnailsRef.current)
      .map(Number)
      .filter((pageIndex) => pageIndex < cacheStart || pageIndex >= cacheEnd);
    if (evicted.length > 0) {
      const next = { ...thumbnailsRef.current };
      for (const pageIndex of evicted) {
        const url = next[pageIndex];
        if (typeof url === "string" && url.startsWith("blob:")) {
          URL.revokeObjectURL(url);
        }
        delete next[pageIndex];
      }
      thumbnailsRef.current = next;
      setThumbnails(next);
    }

    const target = (cacheStart + cacheEnd - 1) / 2;
    const queue = Array.from(
      { length: cacheEnd - cacheStart },
      (_, i) => cacheStart + i,
    )
      .filter((pageIndex) => !thumbnailsRef.current[pageIndex])
      .sort((a, b) => Math.abs(a - target) - Math.abs(b - target));

    const storeThumbnail = (pageIndex: number, thumbUrl: string) => {
      thumbnailsRef.current = {
        ...thumbnailsRef.current,
        [pageIndex]: thumbUrl,
      };
      setThumbnails((prev) => ({
        ...prev,
        [pageIndex]: thumbUrl,
      }));
    };

    const processNext = async () => {
      if (isCancelled) return;
      const pageIndex = queue.shift();
      if (pageIndex === undefined) return;

      try {
        const thumbTask = thumbnailAPI.renderThumb(pageIndex, 1.0);
        const thumbBlob = await thumbTask.toPromise();
        if (isCancelled) return;
        const thumbUrl = URL.createObjectURL(thumbBlob);
        // A rerun may have rendered this page while this worker waited.
        if (thumbnailsRef.current[pageIndex]) {
          URL.revokeObjectURL(thumbUrl);
          return;
        }
        storeThumbnail(pageIndex, thumbUrl);
      } catch (error) {
        console.error(
          "Failed to generate thumbnail for page",
          pageIndex + 1,
          error,
        );
        if (!isCancelled) {
          storeThumbnail(pageIndex, "error");
        }
      }

      await processNext();
    };

    // Start initial concurrent batch
    const workers = Array.from({ length: GENERATE_CONCURRENCY }, () =>
      processNext(),
    );
    Promise.all(workers).catch(() => undefined);

    return () => {
      isCancelled = true;
    };
  }, [
    visible,
    scrollState.totalPages,
    thumbnailAPI,
    activeFileId,
    windowRange.start,
    windowRange.end,
  ]);

  const handlePageClick = (pageIndex: number) => {
    const pageNumber = pageIndex + 1; // Convert to 1-based
    scrollActions.scrollToPage(pageNumber);
  };

  const renderedPages = Array.from(
    { length: Math.max(0, windowRange.end - windowRange.start) },
    (_, i) => windowRange.start + i,
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
                Pages
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
          <ScrollArea style={{ flex: 1 }} viewportRef={viewportRef}>
            <Box p="sm">
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                {windowRange.start > 0 && (
                  <div
                    aria-hidden
                    style={{ height: windowRange.start * ROW_HEIGHT_PX }}
                  />
                )}
                {renderedPages.map((pageIndex) => (
                  <Box
                    key={pageIndex}
                    onClick={() => handlePageClick(pageIndex)}
                    style={{
                      cursor: "pointer",
                      borderRadius: "8px",
                      padding: "8px",
                      backgroundColor:
                        scrollState.currentPage === pageIndex + 1
                          ? "var(--color-primary-100)"
                          : "transparent",
                      border:
                        scrollState.currentPage === pageIndex + 1
                          ? "2px solid var(--color-primary-500)"
                          : "2px solid transparent",
                      transition: "all 0.2s ease",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "8px",
                    }}
                    onMouseEnter={(e) => {
                      if (scrollState.currentPage !== pageIndex + 1) {
                        e.currentTarget.style.backgroundColor = "var(--c-hover)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (scrollState.currentPage !== pageIndex + 1) {
                        e.currentTarget.style.backgroundColor = "transparent";
                      }
                    }}
                  >
                    {/* Thumbnail Image */}
                    {thumbnails[pageIndex] &&
                    thumbnails[pageIndex] !== "error" ? (
                      <PrivateContent>
                        <img
                          src={thumbnails[pageIndex]}
                          alt={`Page ${pageIndex + 1} thumbnail`}
                          style={{
                            maxWidth: "100%",
                            height: "auto",
                            borderRadius: "4px",
                            boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
                            border: "1px solid var(--c-border-subtle)",
                          }}
                        />
                      </PrivateContent>
                    ) : thumbnails[pageIndex] === "error" ? (
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
                        Failed
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
                        color:
                          scrollState.currentPage === pageIndex + 1
                            ? "var(--color-primary-500)"
                            : "var(--c-text-subtle)",
                      }}
                    >
                      Page {pageIndex + 1}
                    </div>
                  </Box>
                ))}
                {windowRange.end < scrollState.totalPages && (
                  <div
                    aria-hidden
                    style={{
                      height:
                        (scrollState.totalPages - windowRange.end) *
                        ROW_HEIGHT_PX,
                    }}
                  />
                )}
              </div>
            </Box>
          </ScrollArea>
        </Box>
      )}
    </>
  );
}
