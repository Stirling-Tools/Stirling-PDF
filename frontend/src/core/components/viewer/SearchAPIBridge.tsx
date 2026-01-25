import { useEffect, useState, useRef } from 'react';
import { useSearch } from '@embedpdf/plugin-search/react';
import { useViewer } from '@app/contexts/ViewerContext';
import { useActiveDocumentId } from '@app/components/viewer/useActiveDocumentId';

interface SearchResult {
  pageIndex: number;
  rects: Array<{
    origin: { x: number; y: number };
    size: { width: number; height: number };
  }>;
}

export function SearchAPIBridge() {
  const activeDocumentId = useActiveDocumentId();
  
  // Don't render the inner component until we have a valid document ID
  if (!activeDocumentId) {
    return null;
  }
  
  return <SearchAPIBridgeInner documentId={activeDocumentId} />;
}

function SearchAPIBridgeInner({ documentId }: { documentId: string }) {
  const { provides: search } = useSearch(documentId);
  const { registerBridge } = useViewer();
  
  // Keep search ref updated to avoid re-running effects when object reference changes
  const searchRef = useRef(search);
  useEffect(() => {
    searchRef.current = search;
  }, [search]);
  
  const [localState, setLocalState] = useState({
    results: null as SearchResult[] | null,
    activeIndex: 0
  });

  // Subscribe to search result changes from EmbedPDF
  const subscriptionRef = useRef<(() => void) | null>(null);
  
  useEffect(() => {
    // Cleanup previous subscription
    if (subscriptionRef.current) {
      subscriptionRef.current();
      subscriptionRef.current = null;
    }
    
    if (!search) return;

    subscriptionRef.current = search.onSearchResultStateChange?.((state: any) => {
      if (!state) return;

      const newState = {
        results: state.results || null,
        activeIndex: (state.activeResultIndex || 0) + 1 // Convert to 1-based index
      };

      setLocalState(prevState => {
        // Only update if state actually changed
        if (prevState.results !== newState.results || prevState.activeIndex !== newState.activeIndex) {
          return newState;
        }
        return prevState;
      });
    }) ?? null;

    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current();
        subscriptionRef.current = null;
      }
    };
  }, [search]);

  // Extract primitive values from localState to avoid object reference dependencies
  const localResults = localState.results;
  const localActiveIndex = localState.activeIndex;

  // Register bridge whenever state changes
  useEffect(() => {
    const currentSearch = searchRef.current;
    if (currentSearch) {
      registerBridge('search', {
        state: { results: localResults, activeIndex: localActiveIndex },
        api: {
          search: async (query: string) => {
            if (currentSearch?.startSearch && currentSearch?.searchAllPages) {
              currentSearch.startSearch();
              return currentSearch.searchAllPages(query);
            }
          },
          clear: () => {
            try {
              if (currentSearch?.stopSearch) {
                currentSearch.stopSearch();
              }
            } catch (error) {
              console.warn('Error stopping search:', error);
            }
            setLocalState({ results: null, activeIndex: 0 });
          },
          next: () => {
            try {
              currentSearch?.nextResult?.();
            } catch (error) {
              console.warn('Error navigating to next result:', error);
            }
          },
          previous: () => {
            try {
              currentSearch?.previousResult?.();
            } catch (error) {
              console.warn('Error navigating to previous result:', error);
            }
          },
          goToResult: (index: number) => {
            try {
              currentSearch?.goToResult?.(index);
            } catch (error) {
              console.warn('Error going to result:', error);
            }
          },
        }
      });
    }
  }, [localResults, localActiveIndex, registerBridge]);

  return null;
}
