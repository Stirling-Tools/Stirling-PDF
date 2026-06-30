import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  Box,
  ScrollArea,
  Text,
  ActionIcon,
  Loader,
  Stack,
  TextInput,
  NumberInput,
  Button,
  Group,
  UnstyledButton,
} from "@mantine/core";
import LocalIcon from "@app/components/shared/LocalIcon";
import { useViewer } from "@app/contexts/ViewerContext";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { useFileContext } from "@app/contexts/FileContext";
import { isStirlingFile, type FileId } from "@app/types/fileContext";
import { createStirlingFilesAndStubs } from "@app/services/fileStubHelpers";
import apiClient from "@app/services/apiClient";
import { PdfBookmarkObject, PdfActionType } from "@embedpdf/models";
import BookmarksIcon from "@mui/icons-material/BookmarksRounded";
import "@app/components/viewer/SidebarBase.css";
import "@app/components/viewer/BookmarkSidebar.css";

interface BookmarkSidebarProps {
  visible: boolean;
  thumbnailVisible: boolean;
  documentCacheKey?: string;
  preloadCacheKeys?: string[];
}

const SIDEBAR_WIDTH = "15rem";

type BookmarkNode = PdfBookmarkObject & { id: string };

type BookmarkCacheStatus = "idle" | "loading" | "success" | "error";

interface BookmarkCacheEntry {
  status: BookmarkCacheStatus;
  bookmarks: PdfBookmarkObject[] | null;
  error: string | null;
  lastFetched: number | null;
}

const createEntry = (
  overrides: Partial<BookmarkCacheEntry> = {},
): BookmarkCacheEntry => ({
  status: "idle",
  bookmarks: null,
  error: null,
  lastFetched: null,
  ...overrides,
});

const resolvePageNumber = (bookmark: PdfBookmarkObject): number | null => {
  const target = bookmark.target;
  if (!target) return null;

  if (target.type === "destination") {
    return target.destination.pageIndex + 1;
  }

  if (target.type === "action") {
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

export const BookmarkSidebar = ({
  visible,
  thumbnailVisible,
  documentCacheKey,
  preloadCacheKeys = [],
}: BookmarkSidebarProps) => {
  const {
    bookmarkActions,
    scrollActions,
    hasBookmarkSupport,
    activeFileId,
    activeFileIndex,
    setActiveFileId,
    getScrollState,
    toggleBookmarkSidebar,
  } = useViewer();
  const { handleToolSelectForced } = useToolWorkflow();
  const { selectors, actions: fileActions } = useFileContext();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddingBookmark, setIsAddingBookmark] = useState(false);
  const [newBookmarkTitle, setNewBookmarkTitle] = useState("");
  const [newBookmarkPage, setNewBookmarkPage] = useState<number>(1);
  const [isSavingBookmark, setIsSavingBookmark] = useState(false);
  const [addBookmarkError, setAddBookmarkError] = useState<string | null>(null);
  const [bookmarkSupport, setBookmarkSupport] = useState(() =>
    hasBookmarkSupport(),
  );
  const [activeEntry, setActiveEntry] = useState<BookmarkCacheEntry>(() =>
    createEntry(),
  );
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
    setSearchTerm("");

    if (!documentCacheKey) {
      setActiveEntry(createEntry());
      bookmarkActions.clearBookmarks();
      return;
    }

    const cached = cacheRef.current.get(documentCacheKey);
    if (cached) {
      setActiveEntry(cached);
      if (cached.status === "success") {
        bookmarkActions.setLocalBookmarks(cached.bookmarks ?? [], null);
      } else if (cached.status === "error") {
        bookmarkActions.setLocalBookmarks(
          cached.bookmarks ?? null,
          cached.error,
        );
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
    preloadCacheKeys.forEach((key) => {
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
    // Only short-circuit on a finalised success cache. Skipping when
    // cached.status === "loading" causes the sidebar to get stuck if
    // the previous fetch was cancelled by a parent re-render (the
    // bookmarkActions reference changes every viewer render because
    // createViewerActions rebuilds the object). See matching change
    // in AttachmentSidebar.
    if (cached && cached.status === "success") {
      return;
    }

    let cancelled = false;
    // Don't write "loading" into the cache - cache only terminal
    // states so a cancelled run can't poison the cache.
    const updateEntry = (entry: BookmarkCacheEntry) => {
      if (entry.status === "success" || entry.status === "error") {
        cacheRef.current.set(key, entry);
      }
      if (!cancelled && currentKeyRef.current === key) {
        setActiveEntry(entry);
      }
    };

    updateEntry(
      createEntry({
        status: "loading",
        bookmarks: cached?.bookmarks ?? null,
        lastFetched: cached?.lastFetched ?? null,
      }),
    );

    const fetchWithRetry = async () => {
      // 30 × 50ms = 1.5s window. After consumeFiles swaps the file the
      // embedpdf bookmark plugin tears down for the old document and
      // re-registers for the new one; until the bridge is back the
      // action returns null. Without retrying on null we'd cache an
      // empty "success" and the just-added bookmark would never show
      // up in the sidebar.
      const maxAttempts = 30;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const result = await bookmarkActions.fetchBookmarks();
          if (result === null) {
            // Bridge not registered yet (document still loading). Wait
            // and retry instead of caching this as a successful empty
            // list.
            if (attempt === maxAttempts - 1) return [];
            await new Promise((resolve) => setTimeout(resolve, 50));
            continue;
          }
          return Array.isArray(result) ? result : [];
        } catch (error: any) {
          const message =
            typeof error?.message === "string"
              ? error.message.toLowerCase()
              : "";
          const notReady =
            message.includes("document") &&
            message.includes("not") &&
            message.includes("open");

          if (!notReady || attempt === maxAttempts - 1) {
            throw error;
          }

          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }
      return [];
    };

    fetchWithRetry()
      .then((bookmarks) => {
        if (cancelled) return;
        const entry = createEntry({
          status: "success",
          bookmarks,
          lastFetched: Date.now(),
        });
        updateEntry(entry);
        if (currentKeyRef.current === key) {
          bookmarkActions.setLocalBookmarks(bookmarks, null);
        }
      })
      .catch((error) => {
        if (cancelled) return;
        const message =
          error instanceof Error ? error.message : "Failed to load bookmarks";
        const fallback = cacheRef.current.get(key);
        const entry = createEntry({
          status: "error",
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
    setFetchNonce((value) => value + 1);
  }, [documentCacheKey, bookmarkActions]);

  const handleOpenAddBookmark = useCallback(() => {
    setAddBookmarkError(null);
    setNewBookmarkTitle("");
    // Default the new bookmark's target page to whatever page the user is
    // currently viewing - matches Acrobat / Foxit behaviour.
    const currentPage = getScrollState?.()?.currentPage ?? 1;
    setNewBookmarkPage(currentPage);
    setIsAddingBookmark(true);
  }, [getScrollState]);

  const handleCancelAddBookmark = useCallback(() => {
    setIsAddingBookmark(false);
    setAddBookmarkError(null);
    setNewBookmarkTitle("");
  }, []);

  // Fallback: open the full Edit Table of Contents tool when inline add is
  // not viable (e.g. the active file is a preview / unmanaged file we
  // cannot consume + replace via FileContext).
  const handleFallbackToTool = useCallback(() => {
    handleToolSelectForced("editTableOfContents");
  }, [handleToolSelectForced]);

  const handleSubmitAddBookmark = useCallback(async () => {
    const title = newBookmarkTitle.trim();
    if (!title) {
      setAddBookmarkError("Bookmark title is required");
      return;
    }
    // Resolve the file the viewer is currently displaying. activeFileId
    // is only set explicitly (user clicked a thumbnail / a tool ran);
    // on a fresh /read upload it stays null and the viewer falls back
    // to activeFileIndex - so we mirror that here. Without this, Save
    // would silently route to the full editor every time on a fresh
    // upload.
    const allFiles = selectors.getFiles();
    const resolvedFile = activeFileId
      ? allFiles.find((f) => isStirlingFile(f) && f.fileId === activeFileId)
      : (allFiles[activeFileIndex] ?? allFiles[0]);
    const resolvedFileId =
      resolvedFile && isStirlingFile(resolvedFile)
        ? (resolvedFile.fileId as FileId)
        : null;
    if (!resolvedFileId) {
      handleFallbackToTool();
      return;
    }
    const fileId = resolvedFileId;
    const file = selectors.getFile(fileId);
    const parentStub = selectors.getStirlingFileStub(fileId);
    if (!file || !parentStub) {
      handleFallbackToTool();
      return;
    }

    setIsSavingBookmark(true);
    setAddBookmarkError(null);
    try {
      // Convert existing PDF bookmarks (from embedpdf) to the backend's
      // payload shape, then append the new one.
      const toPayload = (
        b: PdfBookmarkObject,
      ): {
        title: string;
        pageNumber: number;
        children: any[];
      } => ({
        title: b.title ?? "",
        pageNumber: resolvePageNumber(b) ?? 1,
        children: (b.children ?? []).map(toPayload),
      });
      const existing = (activeEntry.bookmarks ?? []).map(toPayload);
      const bookmarkData = [
        ...existing,
        { title, pageNumber: newBookmarkPage, children: [] },
      ];

      const formData = new FormData();
      formData.append("fileInput", file);
      formData.append("replaceExisting", "true");
      formData.append("bookmarkData", JSON.stringify(bookmarkData));

      const response = await apiClient.post(
        "/api/v1/general/edit-table-of-contents",
        formData,
        { responseType: "blob" },
      );

      const newFile = new File([response.data as Blob], file.name, {
        type: "application/pdf",
      });
      const { stirlingFiles, stubs } = await createStirlingFilesAndStubs(
        [newFile],
        parentStub,
        "editTableOfContents",
      );
      const outputFileIds = await fileActions.consumeFiles(
        [fileId],
        stirlingFiles,
        stubs,
      );

      // Point the viewer at the new file. Without this the viewer's
      // activeFileId-removed effect nulls activeFileId (old file is
      // gone) and the activeFileIndex falls back to 0, which races
      // against the embedpdf plugin reloading - the bookmark /
      // attachment bridges can end up stuck in a "loading" state.
      // useToolOperation does the same thing after consumeFiles.
      if (outputFileIds.length === 1) {
        setActiveFileId(outputFileIds[0]);
      }

      // Reset form. The cache is keyed by documentCacheKey (== fileId);
      // the new fileId triggers our document-switch effect, which
      // resets state and re-fetches once the embedpdf bookmark
      // capability has the new document loaded.
      setIsAddingBookmark(false);
      setNewBookmarkTitle("");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save bookmark";
      setAddBookmarkError(message);
    } finally {
      setIsSavingBookmark(false);
    }
  }, [
    newBookmarkTitle,
    newBookmarkPage,
    activeFileId,
    activeFileIndex,
    selectors,
    fileActions,
    setActiveFileId,
    activeEntry.bookmarks,
    handleFallbackToTool,
  ]);

  const bookmarksWithIds = useMemo(() => {
    const assignIds = (
      nodes: PdfBookmarkObject[],
      prefix = "root",
    ): BookmarkNode[] => {
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

    const bookmarks = Array.isArray(activeEntry.bookmarks)
      ? activeEntry.bookmarks
      : [];
    return assignIds(bookmarks);
  }, [activeEntry.bookmarks]);

  const currentStatus = activeEntry.status;
  const isLocalLoading = bookmarkSupport && currentStatus === "loading";
  const currentError =
    bookmarkSupport && currentStatus === "error" ? activeEntry.error : null;

  const toggleNode = (nodeId: string) => {
    setExpanded((prev) => ({
      ...prev,
      [nodeId]: !(prev[nodeId] ?? true),
    }));
  };

  const handleBookmarkClick = (
    bookmark: PdfBookmarkObject,
    event: React.MouseEvent,
  ) => {
    const target = bookmark.target;
    if (target?.type === "action") {
      const action = target.action;
      if (action.type === PdfActionType.URI && action.uri) {
        event.preventDefault();
        window.open(action.uri, "_blank", "noopener");
        return;
      }
      if (action.type === PdfActionType.LaunchAppOrOpenFile && action.path) {
        event.preventDefault();
        window.open(action.path, "_blank", "noopener");
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
        const childMatches = node.children
          ? applyFilter(node.children as BookmarkNode[])
          : [];
        const matchesSelf = node.title?.toLowerCase().includes(term) ?? false;

        if (matchesSelf || childMatches.length > 0) {
          results.push({
            ...node,
            children: childMatches.length > 0 ? childMatches : node.children,
          });
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

      const hasChildren =
        Array.isArray(node.children) && node.children.length > 0;
      const isNodeExpanded = expanded[node.id] ?? true;

      const pageNumber = resolvePageNumber(node);

      return (
        <div
          key={node.id}
          className="bookmark-item-wrapper"
          style={{
            marginLeft: depth > 0 ? `${depth * 0.75}rem` : "0",
          }}
        >
          <div
            className={`bookmark-item ${pageNumber ? "bookmark-item--clickable" : ""}`}
            onClick={(event) => handleBookmarkClick(node, event)}
            role={pageNumber ? "button" : undefined}
            tabIndex={pageNumber ? 0 : undefined}
            onKeyDown={
              pageNumber
                ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleBookmarkClick(node, event as any);
                    }
                  }
                : undefined
            }
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
                  icon={
                    isNodeExpanded ? "keyboard-arrow-up" : "keyboard-arrow-down"
                  }
                  width="1rem"
                  height="1rem"
                />
              </ActionIcon>
            ) : (
              <span className="bookmark-item__dash">-</span>
            )}
            <div className="bookmark-item__content">
              <Text size="sm" fw={500} className="bookmark-item__title">
                {node.title || "Untitled"}
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
  const showBookmarkList =
    bookmarkSupport && documentCacheKey && filteredBookmarks.length > 0;
  const showEmptyState =
    bookmarkSupport &&
    documentCacheKey &&
    !isLocalLoading &&
    !currentError &&
    currentStatus === "success" &&
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
      className="sidebar-base bookmark-sidebar"
      style={{
        position: "fixed",
        right: thumbnailVisible ? SIDEBAR_WIDTH : 0,
        top: 0,
        bottom: 0,
        width: SIDEBAR_WIDTH,
        zIndex: 998,
      }}
    >
      <div className="sidebar-base__header bookmark-sidebar__header">
        <div className="sidebar-base__header-title bookmark-sidebar__header-title">
          <span className="sidebar-base__header-icon bookmark-sidebar__header-icon">
            <BookmarksIcon />
          </span>
          <Text fw={600} size="sm" tt="uppercase" lts={0.5}>
            Bookmarks
          </Text>
        </div>
        <Box style={{ display: "flex", alignItems: "center", gap: 2 }}>
          <ActionIcon
            variant="subtle"
            size="sm"
            color="gray"
            onClick={toggleBookmarkSidebar}
            aria-label="Close bookmarks sidebar"
            title="Close bookmarks"
          >
            <LocalIcon icon="close-rounded" width="1.1rem" height="1.1rem" />
          </ActionIcon>
        </Box>
      </div>

      <Box
        px="sm"
        pb="sm"
        className="sidebar-base__search bookmark-sidebar__search"
      >
        <TextInput
          value={searchTerm}
          placeholder="Search bookmarks"
          onChange={(event) => setSearchTerm(event.currentTarget.value)}
          leftSection={
            <LocalIcon icon="search" width="1.1rem" height="1.1rem" />
          }
          size="xs"
        />
      </Box>

      <ScrollArea style={{ flex: 1 }}>
        <Box p="sm" className="sidebar-base__content bookmark-sidebar__content">
          {!bookmarkSupport && (
            <div className="sidebar-base__empty-state">
              <Text size="sm" c="dimmed" ta="center">
                Bookmark support is unavailable for this viewer.
              </Text>
            </div>
          )}

          {bookmarkSupport && showNoDocument && (
            <div className="sidebar-base__empty-state">
              <Text size="sm" c="dimmed" ta="center">
                Open a PDF to view its bookmarks.
              </Text>
            </div>
          )}

          {bookmarkSupport && documentCacheKey && currentError && (
            <Stack gap="xs" align="center" className="sidebar-base__error">
              <Text size="sm" c="red" ta="center">
                {currentError}
              </Text>
              <Button size="xs" variant="light" onClick={requestReload}>
                Retry
              </Button>
            </Stack>
          )}

          {bookmarkSupport && documentCacheKey && isLocalLoading && (
            <Stack
              gap="md"
              align="center"
              c="dimmed"
              py="xl"
              className="sidebar-base__loading"
            >
              <Loader size="md" type="dots" />
              <Text size="sm" ta="center">
                Loading bookmarks...
              </Text>
            </Stack>
          )}

          {showEmptyState && !isAddingBookmark && (
            <Stack align="center" gap="sm" py="lg">
              <LocalIcon
                icon="bookmark-add-rounded"
                width="2rem"
                height="2rem"
                style={{ color: "var(--mantine-color-dimmed)" }}
              />
              <Text size="sm" c="dimmed" ta="center">
                No bookmarks in this document
              </Text>
              <Button
                variant="light"
                size="xs"
                onClick={handleOpenAddBookmark}
                leftSection={
                  <LocalIcon icon="add" width="1rem" height="1rem" />
                }
              >
                Add bookmark
              </Button>
            </Stack>
          )}

          {isAddingBookmark && (
            <Box
              mb="sm"
              p="sm"
              data-testid="bookmark-add-form"
              style={{
                border: "1px solid var(--border-subtle)",
                borderRadius: 6,
                background: "var(--bg-raised, var(--mantine-color-gray-0))",
              }}
            >
              <Stack gap="xs">
                <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                  Add bookmark
                </Text>
                <TextInput
                  size="xs"
                  placeholder="Bookmark title"
                  aria-label="Bookmark title"
                  value={newBookmarkTitle}
                  onChange={(e) => setNewBookmarkTitle(e.currentTarget.value)}
                  autoFocus
                  disabled={isSavingBookmark}
                />
                <NumberInput
                  size="xs"
                  label="Page"
                  min={1}
                  clampBehavior="strict"
                  value={newBookmarkPage}
                  onChange={(v) =>
                    setNewBookmarkPage(typeof v === "number" ? v : 1)
                  }
                  disabled={isSavingBookmark}
                />
                {addBookmarkError && (
                  <Text size="xs" c="red">
                    {addBookmarkError}
                  </Text>
                )}
                <Group justify="flex-end" gap="xs">
                  <Button
                    size="xs"
                    variant="default"
                    onClick={handleCancelAddBookmark}
                    disabled={isSavingBookmark}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="xs"
                    color="blue"
                    onClick={handleSubmitAddBookmark}
                    loading={isSavingBookmark}
                    disabled={!newBookmarkTitle.trim()}
                  >
                    Save
                  </Button>
                </Group>
              </Stack>
            </Box>
          )}

          {showBookmarkList && (
            <>
              {!isAddingBookmark && (
                <Button
                  variant="subtle"
                  size="compact-xs"
                  fullWidth
                  onClick={handleOpenAddBookmark}
                  leftSection={
                    <LocalIcon icon="add" width="0.9rem" height="0.9rem" />
                  }
                  mb="xs"
                  styles={{
                    root: {
                      justifyContent: "flex-start",
                      paddingInline: 6,
                    },
                  }}
                >
                  Add bookmark
                </Button>
              )}
              <div className="bookmark-list">
                {renderBookmarks(filteredBookmarks)}
              </div>
            </>
          )}

          {showSearchEmpty && (
            <div className="sidebar-base__empty-state">
              <Text size="sm" c="dimmed" ta="center">
                No bookmarks match your search
              </Text>
            </div>
          )}
        </Box>
      </ScrollArea>

      {bookmarkSupport && documentCacheKey && (
        <Box
          px="sm"
          py="xs"
          style={{
            borderTop: "1px solid var(--border-subtle)",
            backgroundColor: "var(--bg-toolbar)",
            flexShrink: 0,
          }}
        >
          <UnstyledButton
            type="button"
            onClick={handleFallbackToTool}
            style={{ width: "100%" }}
          >
            <Group gap="xs" justify="center" wrap="nowrap">
              <LocalIcon
                icon="bookmark-add-rounded"
                width="0.95rem"
                height="0.95rem"
                style={{ color: "var(--mantine-color-blue-5)" }}
              />
              <Text
                size="xs"
                c="blue.5"
                ta="center"
                style={{ textDecoration: "underline" }}
              >
                Need to reorder or nest? Open the Bookmark Editor
              </Text>
            </Group>
          </UnstyledButton>
        </Box>
      )}
    </Box>
  );
};
