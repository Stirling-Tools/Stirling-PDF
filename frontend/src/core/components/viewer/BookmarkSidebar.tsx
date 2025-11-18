import { useEffect, useMemo, useState, useCallback } from 'react';
import { Box, ScrollArea, Group, Text, ActionIcon, Loader, Stack, TextInput, Tooltip } from '@mantine/core';
import LocalIcon from '@app/components/shared/LocalIcon';
import { useViewer } from '@app/contexts/ViewerContext';
import { PdfBookmarkObject, PdfActionType } from '@embedpdf/models';

interface BookmarkSidebarProps {
  visible: boolean;
  thumbnailVisible: boolean;
  documentCacheKey?: string;
}

const SIDEBAR_WIDTH = '15rem';

type BookmarkNode = PdfBookmarkObject & { id: string };

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

export const BookmarkSidebar = ({ visible, thumbnailVisible, documentCacheKey }: BookmarkSidebarProps) => {
  const { getBookmarkState, bookmarkActions, scrollActions, hasBookmarkSupport } = useViewer();
  const bookmarkState = getBookmarkState();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [bookmarkCache, setBookmarkCache] = useState<Record<string, PdfBookmarkObject[] | null>>({});
  const [errorCache, setErrorCache] = useState<Record<string, string | null>>({});
  const [searchTerm, setSearchTerm] = useState('');

  const bookmarksWithIds = useMemo(() => {
    const assignIds = (nodes: PdfBookmarkObject[], prefix = 'root'): BookmarkNode[] =>
      nodes.map((node, index) => {
        const id = `${prefix}-${index}`;
        return {
          ...node,
          id,
          children: node.children ? assignIds(node.children, id) : undefined,
        };
      });

    return bookmarkState.bookmarks ? assignIds(bookmarkState.bookmarks) : [];
  }, [bookmarkState.bookmarks]);

  useEffect(() => {
    setExpanded({});
    setSearchTerm('');
    if (!documentCacheKey) {
      bookmarkActions.setLocalBookmarks(null);
      return;
    }

    if (Object.prototype.hasOwnProperty.call(bookmarkCache, documentCacheKey)) {
      bookmarkActions.setLocalBookmarks(bookmarkCache[documentCacheKey], errorCache[documentCacheKey] ?? null);
    } else {
      bookmarkActions.setLocalBookmarks(null);
    }
  }, [bookmarkActions, documentCacheKey, bookmarkCache, errorCache]);

  useEffect(() => {
    if (!visible) return;
    if (!hasBookmarkSupport()) return;
    if (!documentCacheKey) return;

    const hasBookmarkEntry = Object.prototype.hasOwnProperty.call(bookmarkCache, documentCacheKey);
    const hasErrorEntry = Object.prototype.hasOwnProperty.call(errorCache, documentCacheKey);
    if (hasBookmarkEntry || hasErrorEntry) return;
    if (bookmarkState.isLoading) return;

    setIsRefreshing(true);
    bookmarkActions
      .fetchBookmarks()
      .catch(() => {})
      .finally(() => setIsRefreshing(false));
  }, [
    visible,
    documentCacheKey,
    bookmarkCache,
    errorCache,
    bookmarkState.isLoading,
    bookmarkActions,
    hasBookmarkSupport,
  ]);

  useEffect(() => {
    if (!documentCacheKey) return;
    if (bookmarkState.isLoading) return;
    if (bookmarkState.bookmarks === null && !bookmarkState.error) return;

    setBookmarkCache(prev => {
      if (prev[documentCacheKey] === bookmarkState.bookmarks) {
        return prev;
      }
      return {
        ...prev,
        [documentCacheKey]: bookmarkState.bookmarks,
      };
    });

    setErrorCache(prev => {
      if (prev[documentCacheKey] === bookmarkState.error) {
        return prev;
      }
      return {
        ...prev,
        [documentCacheKey]: bookmarkState.error,
      };
    });
  }, [bookmarkState.bookmarks, bookmarkState.error, bookmarkState.isLoading, documentCacheKey]);

  const toggleNode = (nodeId: string) => {
    setExpanded(prev => ({
      ...prev,
      [nodeId]: prev[nodeId] === undefined ? false : !prev[nodeId],
    }));
  };

  const handleRefresh = async () => {
    if (!hasBookmarkSupport()) {
      setIsRefreshing(false);
      return;
    }

    setIsRefreshing(true);
    try {
      await bookmarkActions.fetchBookmarks();
    } catch {
      // errors handled via bridge state
    } finally {
      setIsRefreshing(false);
    }
  };

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

  const filterBookmarks = useCallback(
    (nodes: BookmarkNode[]): BookmarkNode[] => {
      if (!searchTerm.trim()) return nodes;
      const term = searchTerm.trim().toLowerCase();

      const applyFilter = (nodeList: BookmarkNode[]): BookmarkNode[] => {
        return nodeList
          .map(node => {
            const childMatches = node.children ? applyFilter(node.children as BookmarkNode[]) : [];
            const matchesSelf = node.title?.toLowerCase().includes(term) ?? false;

            if (matchesSelf || childMatches.length > 0) {
              return { ...node, children: childMatches.length > 0 ? childMatches : node.children };
            }
            return null;
          })
          .filter((node): node is BookmarkNode => node !== null);
      };

      return applyFilter(nodes);
    },
    [searchTerm]
  );

  const filteredBookmarks = useMemo(() => filterBookmarks(bookmarksWithIds), [bookmarksWithIds, filterBookmarks]);

  const handleExpandCollapseAll = (expand: boolean) => {
    const next: Record<string, boolean> = {};
    const setStateRecursively = (nodes: BookmarkNode[], state: boolean) => {
      nodes.forEach(node => {
        if (node.children && node.children.length > 0) {
          next[node.id] = state;
          setStateRecursively(node.children as BookmarkNode[], state);
        }
      });
    };
    setStateRecursively(filteredBookmarks, expand);
    setExpanded(next);
  };

  const renderBookmarks = (nodes: BookmarkNode[], depth = 0) => {
    return nodes.map(node => {
      const hasChildren = Array.isArray(node.children) && node.children.length > 0;
      const isNodeExpanded = expanded[node.id] ?? true;
      const pageNumber = resolvePageNumber(node);

      return (
        <div key={node.id}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.35rem 0.5rem',
              paddingLeft: `${0.5 + depth * 0.75}rem`,
              cursor: pageNumber ? 'pointer' : hasChildren ? 'default' : 'auto',
              borderRadius: '0.4rem',
            }}
            onClick={(event) => handleBookmarkClick(node, event)}
          >
            {hasChildren ? (
              <ActionIcon
                variant="subtle"
                size="sm"
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
              <span style={{ width: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                •
              </span>
            )}
            <div>
              <Text
                size="sm"
                fw={500}
                style={{ lineHeight: 1.3 }}
              >
                {node.title || 'Untitled'}
              </Text>
              {pageNumber && (
                <Text size="xs" c="dimmed">
                  Page {pageNumber}
                </Text>
              )}
            </div>
          </div>
          {hasChildren && isNodeExpanded && renderBookmarks(node.children as BookmarkNode[], depth + 1)}
        </div>
      );
    });
  };

  if (!visible) {
    return null;
  }

  return (
    <Box
      style={{
        position: 'fixed',
        right: thumbnailVisible ? SIDEBAR_WIDTH : 0,
        top: 0,
        bottom: 0,
        width: SIDEBAR_WIDTH,
        backgroundColor: 'var(--bg-surface)',
        borderLeft: '1px solid var(--border-subtle)',
        zIndex: 998,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-2px 0 8px rgba(0, 0, 0, 0.1)',
      }}
    >
      <Group justify="space-between" px="sm" py="xs">
        <Text fw={600} size="sm">
          Bookmarks
        </Text>
        <Group gap="xs">
          <Tooltip label="Collapse all">
            <ActionIcon
              variant="subtle"
              size="sm"
              onClick={() => handleExpandCollapseAll(false)}
              aria-label="Collapse all bookmarks"
            >
              <LocalIcon icon="keyboard-arrow-up" width="1rem" height="1rem" />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Expand all">
            <ActionIcon
              variant="subtle"
              size="sm"
              onClick={() => handleExpandCollapseAll(true)}
              aria-label="Expand all bookmarks"
            >
              <LocalIcon icon="keyboard-arrow-down" width="1rem" height="1rem" />
            </ActionIcon>
          </Tooltip>
          <ActionIcon
            variant="subtle"
            size="sm"
            onClick={handleRefresh}
            disabled={bookmarkState.isLoading || isRefreshing}
            title="Refresh bookmarks"
          >
            {bookmarkState.isLoading || isRefreshing ? (
              <Loader size="xs" />
            ) : (
              <LocalIcon icon="refresh" width="1rem" height="1rem" />
            )}
          </ActionIcon>
        </Group>
      </Group>

      <Box px="sm" pb="sm">
        <TextInput
          value={searchTerm}
          placeholder="Search bookmarks"
          onChange={(event) => setSearchTerm(event.currentTarget.value)}
          leftSection={<LocalIcon icon="search" width="1.1rem" height="1.1rem" />}
          size="xs"
        />
      </Box>

      <ScrollArea style={{ flex: 1 }}>
        <Box p="sm">
          {!hasBookmarkSupport() && (
            <Text size="xs" c="dimmed">
              Bookmark support is unavailable for this viewer.
            </Text>
          )}

          {bookmarkState.error && hasBookmarkSupport() && (
            <Text size="xs" c="red" mb="sm">
              {bookmarkState.error}
            </Text>
          )}

          {hasBookmarkSupport() && bookmarkState.isLoading && !bookmarkState.bookmarks && (
            <Stack gap="xs" align="center" c="dimmed" py="md">
              <Loader size="sm" />
              <Text size="xs">Loading bookmarks…</Text>
            </Stack>
          )}

          {hasBookmarkSupport() &&
            bookmarkState.bookmarks &&
            bookmarkState.bookmarks.length === 0 &&
            !bookmarkState.isLoading && (
            <Text size="xs" c="dimmed">
              No bookmarks found in this document.
            </Text>
          )}

          {hasBookmarkSupport() &&
            filteredBookmarks &&
            filteredBookmarks.length > 0 &&
            renderBookmarks(filteredBookmarks)}
        </Box>
      </ScrollArea>
    </Box>
  );
};
