import { useEffect, useMemo, useState, useCallback } from 'react';
import { useBookmarkCapability, BookmarkCapability } from '@embedpdf/plugin-bookmark/react';
import { useViewer } from '@app/contexts/ViewerContext';
import { BookmarkState, BookmarkAPIWrapper } from '@app/contexts/viewer/viewerBridges';

export function BookmarkAPIBridge() {
  const { provides: bookmarkCapability } = useBookmarkCapability();
  const { registerBridge } = useViewer();
  const [state, setState] = useState<BookmarkState>({
    bookmarks: null,
    isLoading: false,
    error: null,
  });

  const fetchBookmarks = useCallback(
    async (capability: BookmarkCapability) => {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      try {
        const task = capability.getBookmarks();
        const result = await task.toPromise();
        setState({
          bookmarks: result.bookmarks ?? [],
          isLoading: false,
          error: null,
        });
        return result.bookmarks ?? [];
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load bookmarks';
        setState({
          bookmarks: null,
          isLoading: false,
          error: message,
        });
        throw error;
      }
    },
    []
  );

  const api = useMemo<BookmarkAPIWrapper | null>(() => {
    if (!bookmarkCapability) return null;

    return {
      fetchBookmarks: () => fetchBookmarks(bookmarkCapability),
      clearBookmarks: () => {
        setState({
          bookmarks: null,
          isLoading: false,
          error: null,
        });
      },
      setLocalBookmarks: (bookmarks, error = null) => {
        setState({
          bookmarks,
          isLoading: false,
          error,
        });
      },
    };
  }, [bookmarkCapability, fetchBookmarks]);

  useEffect(() => {
    if (!api) return;

    registerBridge('bookmark', {
      state,
      api,
    });
  }, [api, state, registerBridge]);

  return null;
}
