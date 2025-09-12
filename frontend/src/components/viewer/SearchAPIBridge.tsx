import { useEffect } from 'react';
import { useSearch } from '@embedpdf/plugin-search/react';

/**
 * Component that runs inside EmbedPDF context and bridges search controls to global window
 */
export function SearchAPIBridge() {
  const { provides: search, state } = useSearch();

  useEffect(() => {
    if (search && state) {

      // Export search controls to global window for toolbar access
      (window as any).embedPdfSearch = {
        search: async (query: string) => {
          try {
            search.startSearch();
            const results = await search.searchAllPages(query);
            return results;
          } catch (error) {
            console.error('Search error:', error);
            throw error;
          }
        },
        clearSearch: () => {
          search.stopSearch();
        },
        nextResult: () => {
          return search.nextResult();
        },
        previousResult: () => {
          return search.previousResult();
        },
        goToResult: (index: number) => {
          return search.goToResult(index);
        },
        // State getters
        getSearchQuery: () => state.query,
        isActive: () => state.active,
        isLoading: () => state.loading,
        // Current state for UI updates
        state: state,
        // Debug info
        searchAPI: search,
        availableMethods: search ? Object.keys(search) : [],
      };

    }
  }, [search, state]);

  return null;
}
