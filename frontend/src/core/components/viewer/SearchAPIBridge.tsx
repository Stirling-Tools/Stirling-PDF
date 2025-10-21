import { useEffect, useState } from 'react';
import { useSearch } from '@embedpdf/plugin-search/react';
import { useViewer } from '@app/contexts/ViewerContext';

interface SearchResult {
  pageIndex: number;
  rects: Array<{
    origin: { x: number; y: number };
    size: { width: number; height: number };
  }>;
}

/**
 * SearchAPIBridge manages search state and provides search functionality.
 * Listens for search result changes from EmbedPDF and maintains local state.
 */
export function SearchAPIBridge() {
  const { provides: search } = useSearch();
  const { registerBridge } = useViewer();
  
  const [localState, setLocalState] = useState({
    results: null as SearchResult[] | null,
    activeIndex: 0
  });

  // Subscribe to search result changes from EmbedPDF
  useEffect(() => {
    if (!search) return;

    const unsubscribe = search.onSearchResultStateChange?.((state: any) => {
      const newState = {
        results: state?.results || null,
        activeIndex: (state?.activeResultIndex || 0) + 1 // Convert to 1-based index
      };
      
      setLocalState(prevState => {
        // Only update if state actually changed
        if (prevState.results !== newState.results || prevState.activeIndex !== newState.activeIndex) {
          return newState;
        }
        return prevState;
      });
    });

    return unsubscribe;
  }, [search]);

  // Register bridge whenever search API or state changes
  useEffect(() => {
    if (search) {
      registerBridge('search', {
        state: localState,
        api: {
          search: async (query: string) => {
            search.startSearch();
            return search.searchAllPages(query);
          },
          clear: () => {
            search.stopSearch();
            setLocalState({ results: null, activeIndex: 0 });
          },
          next: () => search.nextResult(),
          previous: () => search.previousResult(),
          goToResult: (index: number) => search.goToResult(index),
        }
      });
    }
  }, [search, localState]);

  return null;
}
