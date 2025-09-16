import { useEffect, useState } from 'react';
import { useSearch } from '@embedpdf/plugin-search/react';
import { useViewer } from '../../contexts/ViewerContext';

/**
 * SearchAPIBridge manages search state and provides search functionality.
 * Listens for search result changes from EmbedPDF and maintains local state.
 */
export function SearchAPIBridge() {
  const { provides: search } = useSearch();
  const { registerBridge } = useViewer();
  
  const [localState, setLocalState] = useState({
    results: null as any[] | null,
    activeIndex: 0
  });

  // Subscribe to search result changes from EmbedPDF
  useEffect(() => {
    if (!search) return;

    const unsubscribe = search.onSearchResultStateChange?.((state: any) => {
      setLocalState({
        results: state?.results || null,
        activeIndex: (state?.activeResultIndex || 0) + 1 // Convert to 1-based index
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
  }, [search, localState, registerBridge]);

  return null;
}
