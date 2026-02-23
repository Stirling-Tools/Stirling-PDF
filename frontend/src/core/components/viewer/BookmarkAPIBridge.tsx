import { useEffect, useMemo, useState, useCallback } from 'react';
import { useBookmarkCapability, BookmarkCapability } from '@embedpdf/plugin-bookmark/react';
import { useViewer } from '@app/contexts/ViewerContext';
import { BookmarkState, BookmarkAPIWrapper } from '@app/contexts/viewer/viewerBridges';
import { useDocumentReady } from '@app/components/viewer/hooks/useDocumentReady';

/**
 * Connects the PDF bookmark plugin to the shared ViewerContext.
 */
export function BookmarkAPIBridge() {
  const { provides: bookmarkCapability } = useBookmarkCapability();
  const { registerBridge } = useViewer();
  const [state, setState] = useState<BookmarkState>({
    bookmarks: null,
    isLoading: false,
    error: null,
  });
  const documentReady = useDocumentReady();

  const fetchBookmarks = useCallback(
    async (capability: BookmarkCapability) => {
      if (!documentReady) {
        setState(prev => ({
          ...prev,
          error: 'Document not ready or bookmark capability not available',
          isLoading: false,
        }));
        return [];
      }

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
    [documentReady]
  );

  const api = useMemo<BookmarkAPIWrapper | null>(() => {
    // Only provide API when both capability AND document are ready
    if (!bookmarkCapability || !documentReady) return null;

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
  }, [bookmarkCapability, documentReady, fetchBookmarks]);

  useEffect(() => {
    if (!api) {
      registerBridge('bookmark', null);
      return;
    }

    registerBridge('bookmark', {
      state,
      api,
    });

    return () => {
      registerBridge('bookmark', null);
    };
  }, [api, state, registerBridge]);

  return null;
}
