import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Box, ScrollArea, Text, ActionIcon, Loader, Stack, TextInput, Button } from '@mantine/core';
import LocalIcon from '@app/components/shared/LocalIcon';
import { useViewer } from '@app/contexts/ViewerContext';
import { PdfBookmarkObject, PdfActionType } from '@embedpdf/models';
import BookmarksIcon from '@mui/icons-material/BookmarksRounded';
import '@app/components/viewer/BookmarkSidebar.css';

interface BookmarkSidebarProps {
  visible: boolean;
  thumbnailVisible: boolean;
  documentCacheKey?: string;
  preloadCacheKeys?: string[];
}

const SIDEBAR_WIDTH = '15rem';

type BookmarkNode = PdfBookmarkObject & { id: string };

type BookmarkCacheStatus = 'idle' | 'loading' | 'success' | 'error';

interface BookmarkCacheEntry {
  status: BookmarkCacheStatus;
  bookmarks: PdfBookmarkObject[] | null;
  error: string | null;
  lastFetched: number | null;
}

const createEntry = (overrides: Partial<BookmarkCacheEntry> = {}): BookmarkCacheEntry => ({
  status: 'idle',
  bookmarks: null,
  error: null,
  lastFetched: null,
  ...overrides,
});

const resolvePageNumber = (bookmark: PdfBookmarkObject): number | null => {
  const target = bookmark.target;
  if (!target) return null;

  if (target.type === 'destination') {
    return target.destination.pageIndex + 1;
  }

  if (target.type === 'action') {
    const action = target.action;
    if (
      action.type === PdfActionType.Goto ||
      action.type === PdfActionType.RemoteGoto
    ) {
      return action.destination?.pageIndex !== undefined
        ? action.destination.pageIndex + 1
        : null;
    }
  }

  return null;
};

export const BookmarkSidebar = ({ visible, thumbnailVisible, documentCacheKey, preloadCacheKeys = [] }: BookmarkSidebarProps) => {
  const { bookmarkActions, scrollActions, hasBookmarkSupport } = useViewer();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [bookmarkSupport, setBookmarkSupport] = useState(() => hasBookmarkSupport());
  const [activeEntry, setActiveEntry] = useState<BookmarkCacheEntry>(() => createEntry());
  const cacheRef = useRef<Map<string, BookmarkCacheEntry>>(new Map());
  const [fetchNonce, setFetchNonce] = useState(0);
  const currentKeyRef = useRef<string | null>(documentCacheKey ?? null);

  useEffect(() => {
    currentKeyRef.current = documentCacheKey ?? null;
  }, [documentCacheKey]);

  // Poll once until the bookmark bridge registers
  useEffect(() => {
    if (bookmarkSupport) return;
    let cancelled = false;
    const id = setInterval(() => {
      if (!cancelled && hasBookmarkSupport()) {
        setBookmarkSupport(true);
        clearInterval(id);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [bookmarkSupport, hasBookmarkSupport]);

  // Reset UI and load cached entry (if any) when switching documents
  useEffect(() => {
    setExpanded({});
    setSearchTerm('');

    if (!documentCacheKey) {
      setActiveEntry(createEntry());
      bookmarkActions.clearBookmarks();
      return;
    }

    const cached = cacheRef.current.get(documentCacheKey);
    if (cached) {
      setActiveEntry(cached);
      if (cached.status === 'success') {
        bookmarkActions.setLocalBookmarks(cached.bookmarks ?? [], null);
      } else if (cached.status === 'error') {
        bookmarkActions.setLocalBookmarks(cached.bookmarks ?? null, cached.error);
      } else {
        bookmarkActions.clearBookmarks();
      }
    } else {
      setActiveEntry(createEntry());
      bookmarkActions.clearBookmarks();
    }
  }, [documentCacheKey, bookmarkActions]);

  // Keep cache bounded to the currently relevant keys
  useEffect(() => {
    const allowed = new Set<string>();
    if (documentCacheKey) {
      allowed.add(documentCacheKey);
    }
    preloadCacheKeys.forEach(key => {
      if (key) {
        allowed.add(key);
      }
    });

    cacheRef.current.forEach((_entry, key) => {
      if (!allowed.has(key)) {
        cacheRef.current.delete(key);
      }
    });
  }, [documentCacheKey, preloadCacheKeys]);

  // Fetch bookmarks for the active document when needed
  useEffect(() => {
    if (!bookmarkSupport || !documentCacheKey) return;

    const key = documentCacheKey;
    const cached = cacheRef.current.get(key);
    if (cached && (cached.status === 'loading' || cached.status === 'success')) {
      return;
    }

    let cancelled = false;
    const updateEntry = (entry: BookmarkCacheEntry) => {
      cacheRef.current.set(key, entry);
      if (!cancelled && currentKeyRef.current === key) {
        setActiveEntry(entry);
      }
    };

    updateEntry(createEntry({
      status: 'loading',
      bookmarks: cached?.bookmarks ?? null,
      lastFetched: cached?.lastFetched ?? null,
    }));

    const fetchWithRetry = async () => {
      const maxAttempts = 10;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const result = await bookmarkActions.fetchBookmarks();
          return Array.isArray(result) ? result : [];
        } catch (error: any) {
          const message = typeof error?.message === 'string' ? error.message.toLowerCase() : '';
          const notReady =
            message.includes('document') &&
            message.includes('not') &&
            message.includes('open');

          if (!notReady || attempt === maxAttempts - 1) {
            throw error;
          }

          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }
      return [];
    };

    fetchWithRetry()
      .then(bookmarks => {
        if (cancelled) return;
        const entry = createEntry({
          status: 'success',
          bookmarks,
          lastFetched: Date.now(),
        });
        updateEntry(entry);
        if (currentKeyRef.current === key) {
          bookmarkActions.setLocalBookmarks(bookmarks, null);
        }
      })
      .catch(error => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : 'Failed to load bookmarks';
        const fallback = cacheRef.current.get(key);
        const entry = createEntry({
          status: 'error',
          bookmarks: fallback?.bookmarks ?? null,
          error: message,
          lastFetched: fallback?.lastFetched ?? null,
        });
        updateEntry(entry);
        if (currentKeyRef.current === key) {
          bookmarkActions.setLocalBookmarks(null, message);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [bookmarkSupport, documentCacheKey, fetchNonce, bookmarkActions]);

  const requestReload = useCallback(() => {
    if (!documentCacheKey) return;
    cacheRef.current.delete(documentCacheKey);
    setActiveEntry(createEntry());
    bookmarkActions.clearBookmarks();
    setFetchNonce(value => value + 1);
  }, [documentCacheKey, bookmarkActions]);

  const bookmarksWithIds = useMemo(() => {
    const assignIds = (nodes: PdfBookmarkObject[], prefix = 'root'): BookmarkNode[] => {
      if (!Array.isArray(nodes)) {
        return [];
      }

      return nodes.map((node, index) => {
        const id = `${prefix}-${index}`;
        return {
          ...node,
          id,
          children: node.children ? assignIds(node.children, id) : undefined,
        };
      });
    };

    const bookmarks = Array.isArray(activeEntry.bookmarks) ? activeEntry.bookmarks : [];
    return assignIds(bookmarks);
  }, [activeEntry.bookmarks]);

  const currentStatus = activeEntry.status;
  const isLocalLoading = bookmarkSupport && currentStatus === 'loading';
  const currentError = bookmarkSupport && currentStatus === 'error' ? activeEntry.error : null;

  const toggleNode = (nodeId: string) => {
    setExpanded(prev => ({
      ...prev,
      [nodeId]: !(prev[nodeId] ?? true),
    }));
  };

  const expandAll = useCallback(() => {
    const allExpanded: Record<string, boolean> = {};
    const expandRecursive = (nodes: BookmarkNode[]) => {
      nodes.forEach(node => {
        if (node.children && node.children.length > 0) {
          allExpanded[node.id] = true;
          expandRecursive(node.children as BookmarkNode[]);
        }
      });
    };
    expandRecursive(bookmarksWithIds);
    setExpanded(allExpanded);
  }, [bookmarksWithIds]);

  const collapseAll = useCallback(() => {
    const allCollapsed: Record<string, boolean> = {};
    const collapseRecursive = (nodes: BookmarkNode[]) => {
      nodes.forEach(node => {
        if (node.children && node.children.length > 0) {
          allCollapsed[node.id] = false;
          collapseRecursive(node.children as BookmarkNode[]);
        }
      });
    };
    collapseRecursive(bookmarksWithIds);
    setExpanded(allCollapsed);
  }, [bookmarksWithIds]);

  const handleBookmarkClick = (bookmark: PdfBookmarkObject, event: React.MouseEvent) => {
    const target = bookmark.target;
    if (target?.type === 'action') {
      const action = target.action;
      if (action.type === PdfActionType.URI && action.uri) {
        event.preventDefault();
        window.open(action.uri, '_blank', 'noopener');
        return;
      }
      if (action.type === PdfActionType.LaunchAppOrOpenFile && action.path) {
        event.preventDefault();
        window.open(action.path, '_blank', 'noopener');
        return;
      }
    }

    const pageNumber = resolvePageNumber(bookmark);
    if (pageNumber) {
      scrollActions.scrollToPage(pageNumber);
    }
  };

  const filteredBookmarks = useMemo(() => {
    if (!searchTerm.trim()) return bookmarksWithIds;
    const term = searchTerm.trim().toLowerCase();

    const applyFilter = (nodeList: BookmarkNode[]): BookmarkNode[] => {
      const results: BookmarkNode[] = [];

      for (const node of nodeList) {
        const childMatches = node.children ? applyFilter(node.children as BookmarkNode[]) : [];
        const matchesSelf = node.title?.toLowerCase().includes(term) ?? false;

        if (matchesSelf || childMatches.length > 0) {
          results.push({ ...node, children: childMatches.length > 0 ? childMatches : node.children });
        }
      }

      return results;
    };

    return applyFilter(bookmarksWithIds);
  }, [bookmarksWithIds, searchTerm]);

  const renderBookmarks = (nodes: BookmarkNode[], depth = 0) => {
    if (!nodes || !Array.isArray(nodes)) {
      return null;
    }

    return nodes.map((node, _index) => {
      if (!node || !node.id) {
        return null;
      }

      const hasChildren = Array.isArray(node.children) && node.children.length > 0;
      const isNodeExpanded = expanded[node.id] ?? true;

      const pageNumber = resolvePageNumber(node);

      return (
        <div
          key={node.id}
          className="bookmark-item-wrapper"
          style={{
            marginLeft: depth > 0 ? `${depth * 0.75}rem` : '0',
          }}
        >
          <div
            className={`bookmark-item ${pageNumber ? 'bookmark-item--clickable' : ''}`}
            onClick={(event) => handleBookmarkClick(node, event)}
            role={pageNumber ? "button" : undefined}
            tabIndex={pageNumber ? 0 : undefined}
            onKeyDown={pageNumber ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                handleBookmarkClick(node, event as any);
              }
            } : undefined}
          >
            {hasChildren ? (
              <ActionIcon
                variant="subtle"
                size="sm"
                className="bookmark-item__expand-icon"
                onClick={(event) => {
                  event.stopPropagation();
                  toggleNode(node.id);
                }}
              >
                <LocalIcon
                  icon={isNodeExpanded ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
                  width="1rem"
                  height="1rem"
                />
              </ActionIcon>
            ) : (
              <span className="bookmark-item__dash">-</span>
            )}
            <div className="bookmark-item__content">
              <Text
                size="sm"
                fw={500}
                className="bookmark-item__title"
              >
                {node.title || 'Untitled'}
              </Text>
              {pageNumber && (
                <Text size="xs" c="dimmed" className="bookmark-item__page">
                  Page {pageNumber}
                </Text>
              )}
            </div>
          </div>
          {hasChildren && isNodeExpanded && (
            <div className="bookmark-item__children">
              {renderBookmarks(node.children as BookmarkNode[], depth + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  const isSearchActive = searchTerm.trim().length > 0;
  const hasBookmarks = bookmarksWithIds.length > 0;
  const showBookmarkList = bookmarkSupport && documentCacheKey && filteredBookmarks.length > 0;
  const showEmptyState =
    bookmarkSupport &&
    documentCacheKey &&
    !isLocalLoading &&
    !currentError &&
    currentStatus === 'success' &&
    !hasBookmarks;
  const showSearchEmpty =
    bookmarkSupport &&
    documentCacheKey &&
    isSearchActive &&
    hasBookmarks &&
    filteredBookmarks.length === 0;
  const showNoDocument = bookmarkSupport && !documentCacheKey;

  if (!visible) {
    return null;
  }

  return (
    <Box
      className="bookmark-sidebar"
      style={{
        position: 'fixed',
        right: thumbnailVisible ? SIDEBAR_WIDTH : 0,
        top: 0,
        bottom: 0,
        width: SIDEBAR_WIDTH,
        zIndex: 998,
      }}
    >
      <div className="bookmark-sidebar__header">
        <div className="bookmark-sidebar__header-title">
          <span className="bookmark-sidebar__header-icon">
            <BookmarksIcon />
          </span>
          <Text fw={600} size="sm" tt="uppercase" lts={0.5}>
            Bookmarks
          </Text>
        </div>
        {bookmarkSupport && bookmarksWithIds.length > 0 && (
          <>
            {Object.values(expanded).some(val => val === false) ? (
              <ActionIcon
                variant="subtle"
                size="sm"
                onClick={expandAll}
                aria-label="Expand all bookmarks"
                title="Expand all"
              >
                <LocalIcon icon="unfold-more" width="1.1rem" height="1.1rem" />
              </ActionIcon>
            ) : (
              <ActionIcon
                variant="subtle"
                size="sm"
                onClick={collapseAll}
                aria-label="Collapse all bookmarks"
                title="Collapse all"
              >
                <LocalIcon icon="unfold-less" width="1.1rem" height="1.1rem" />
              </ActionIcon>
            )}
          </>
        )}
      </div>

      <Box px="sm" pb="sm" className="bookmark-sidebar__search">
        <TextInput
          value={searchTerm}
          placeholder="Search bookmarks"
          onChange={(event) => setSearchTerm(event.currentTarget.value)}
          leftSection={<LocalIcon icon="search" width="1.1rem" height="1.1rem" />}
          size="xs"
        />
      </Box>

      <ScrollArea style={{ flex: 1 }}>
        <Box p="sm" className="bookmark-sidebar__content">
          {!bookmarkSupport && (
            <div className="bookmark-sidebar__empty-state">
              <Text size="sm" c="dimmed" ta="center">
                Bookmark support is unavailable for this viewer.
              </Text>
            </div>
          )}

          {bookmarkSupport && showNoDocument && (
            <div className="bookmark-sidebar__empty-state">
              <Text size="sm" c="dimmed" ta="center">
                Open a PDF to view its bookmarks.
              </Text>
            </div>
          )}

          {bookmarkSupport && documentCacheKey && currentError && (
            <Stack gap="xs" align="center" className="bookmark-sidebar__error">
              <Text size="sm" c="red" ta="center">
                {currentError}
              </Text>
              <Button size="xs" variant="light" onClick={requestReload}>
                Retry
              </Button>
            </Stack>
          )}

          {bookmarkSupport && documentCacheKey && isLocalLoading && (
            <Stack gap="md" align="center" c="dimmed" py="xl" className="bookmark-sidebar__loading">
              <Loader size="md" type="dots" />
              <Text size="sm" ta="center">
                Loading bookmarks...
              </Text>
            </Stack>
          )}

          {showEmptyState && (
            <div className="bookmark-sidebar__empty-state">
              <Text size="sm" c="dimmed" ta="center">
                No bookmarks in this document
              </Text>
            </div>
          )}

          {showBookmarkList && (
            <div className="bookmark-list">
              {renderBookmarks(filteredBookmarks)}
            </div>
          )}

          {showSearchEmpty && (
            <div className="bookmark-sidebar__empty-state">
              <Text size="sm" c="dimmed" ta="center">
                No bookmarks match your search
              </Text>
            </div>
          )}
        </Box>
      </ScrollArea>
    </Box>
  );
};
