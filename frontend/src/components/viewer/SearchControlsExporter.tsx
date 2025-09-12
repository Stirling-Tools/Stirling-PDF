import { useEffect } from 'react';
import { useSearch } from '@embedpdf/plugin-search/react';

/**
 * Component that runs inside EmbedPDF context and exports search controls globally
 */
export function SearchControlsExporter() {
  const { provides: search, state } = useSearch();

  useEffect(() => {
    if (search && state) {
      // Debug: log the actual search hook structure
      console.log('🔍 EmbedPDF search hook structure:', {
        search,
        state,
        searchKeys: Object.keys(search),
        stateKeys: Object.keys(state),
        currentQuery: state.query,
        isActive: state.active,
        isLoading: state.loading
      });

      // Export search controls to global window for toolbar access
      (window as any).embedPdfSearch = {
        search: async (query: string) => {
          console.log('🔍 EmbedPDF: Starting search for:', query);
          console.log('🔍 Search API available:', !!search);
          console.log('🔍 Search API methods:', search ? Object.keys(search) : 'none');
          
          try {
            // First start the search session
            search.startSearch();
            console.log('🔍 startSearch() called');
            
            // Then search all pages with the query
            const results = await search.searchAllPages(query);
            console.log('🔍 searchAllPages() results:', results);
            
            return results;
          } catch (error) {
            console.error('🔍 Search error:', error);
            throw error;
          }
        },
        clearSearch: () => {
          console.log('🔍 EmbedPDF: Stopping search');
          search.stopSearch();
        },
        nextResult: () => {
          console.log('🔍 EmbedPDF: Going to next search result');
          const newIndex = search.nextResult();
          console.log('🔍 EmbedPDF: New active result index:', newIndex);
          // The goToResult method should handle scrolling automatically
          return newIndex;
        },
        previousResult: () => {
          console.log('🔍 EmbedPDF: Going to previous search result');
          const newIndex = search.previousResult();
          console.log('🔍 EmbedPDF: New active result index:', newIndex);
          // The goToResult method should handle scrolling automatically
          return newIndex;
        },
        goToResult: (index: number) => {
          console.log('🔍 EmbedPDF: Going to search result:', index);
          const resultIndex = search.goToResult(index);
          console.log('🔍 EmbedPDF: Navigated to result index:', resultIndex);
          return resultIndex;
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
      
      console.log('🔍 EmbedPDF search controls exported to window.embedPdfSearch', {
        currentQuery: state.query,
        isActive: state.active,
        isLoading: state.loading,
        searchAPI: search,
        availableMethods: search ? Object.keys(search) : 'no search API',
        state: state
      });
    } else {
      console.warn('EmbedPDF search hook not available yet');
    }
  }, [search, state]);

  return null; // This component doesn't render anything
}