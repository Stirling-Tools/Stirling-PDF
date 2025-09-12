import React, { useState, useEffect, useMemo } from 'react';
import { useSearch } from '@embedpdf/plugin-search/react';

interface SearchLayerProps {
  pageIndex: number;
  scale: number;
  highlightColor?: string;
  activeHighlightColor?: string;
  opacity?: number;
  padding?: number;
  borderRadius?: number;
}

interface SearchResultState {
  results: Array<{
    pageIndex: number;
    rects: Array<{
      origin: { x: number; y: number };
      size: { width: number; height: number };
    }>;
  }>;
  activeResultIndex?: number;
}

export function CustomSearchLayer({ 
  pageIndex, 
  scale, 
  highlightColor = '#FFFF00',
  activeHighlightColor = '#FFBF00',
  opacity = 0.6,
  padding = 2,
  borderRadius = 4
}: SearchLayerProps) {
  const { provides: searchProvides } = useSearch();
  const [searchResultState, setSearchResultState] = useState<SearchResultState | null>(null);

  // Subscribe to search result state changes
  useEffect(() => {
    if (!searchProvides) {
      console.log('🔍 CustomSearchLayer: No search provides available for page', pageIndex);
      return;
    }

    console.log('🔍 CustomSearchLayer: Setting up search result subscription for page', pageIndex);
    console.log('🔍 CustomSearchLayer: Available search methods:', Object.keys(searchProvides));
    
    const unsubscribe = searchProvides.onSearchResultStateChange?.((state: SearchResultState) => {
      console.log('🔍 CustomSearchLayer: Search result state changed for page', pageIndex, ':', {
        state,
        resultsCount: state?.results?.length || 0,
        activeIndex: state?.activeResultIndex,
        results: state?.results
      });
      
      // Expose search results globally for SearchInterface
      if (state?.results) {
        (window as any).currentSearchResults = state.results;
        (window as any).currentActiveIndex = (state.activeResultIndex || 0) + 1; // Convert to 1-based index
        console.log('🔍 CustomSearchLayer: Exposed global search data:', {
          totalResults: state.results.length,
          activeIndex: (state.activeResultIndex || 0) + 1
        });

        // Auto-scroll to active result if we have one
        if (state.activeResultIndex !== undefined && state.activeResultIndex >= 0) {
          const activeResult = state.results[state.activeResultIndex];
          if (activeResult) {
            console.log('🔍 CustomSearchLayer: Auto-scrolling to active result on page', activeResult.pageIndex);
            
            // Use the scroll API to navigate to the page containing the active result
            const scrollAPI = (window as any).embedPdfScroll;
            if (scrollAPI && scrollAPI.scrollToPage) {
              // Convert 0-based page index to 1-based page number
              const pageNumber = activeResult.pageIndex + 1;
              scrollAPI.scrollToPage(pageNumber);
              console.log('🔍 CustomSearchLayer: Scrolled to page', pageNumber);
            }
          }
        }
      } else {
        (window as any).currentSearchResults = null;
        (window as any).currentActiveIndex = 0;
      }
      
      setSearchResultState(state);
    });

    if (!unsubscribe) {
      console.warn('🔍 CustomSearchLayer: No onSearchResultStateChange method available');
    }

    return unsubscribe;
  }, [searchProvides, pageIndex]);

  // Filter results for current page while preserving original indices
  const pageResults = useMemo(() => {
    if (!searchResultState?.results) {
      console.log(`🔍 CustomSearchLayer: No search results for page ${pageIndex} (no results array)`);
      return [];
    }

    const filtered = searchResultState.results
      .map((result, originalIndex) => ({ result, originalIndex }))
      .filter(({ result }) => result.pageIndex === pageIndex);
    
    console.log(`🔍 CustomSearchLayer: Page ${pageIndex} filtering:`, {
      totalResults: searchResultState.results.length,
      pageResults: filtered.length,
      allPageIndices: searchResultState.results.map(r => r.pageIndex),
      currentPage: pageIndex,
      filtered
    });
    return filtered;
  }, [searchResultState, pageIndex]);

  if (!pageResults.length) {
    return null;
  }

  return (
    <div style={{ 
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: 10
    }}>
      {pageResults.map(({ result, originalIndex }, idx) => (
        <div key={`result-${idx}`}>
          {result.rects.map((rect, rectIdx) => (
            <div
              key={`rect-${idx}-${rectIdx}`}
              style={{
                position: 'absolute',
                top: `${rect.origin.y * scale - padding}px`,
                left: `${rect.origin.x * scale - padding}px`,
                width: `${rect.size.width * scale + (padding * 2)}px`,
                height: `${rect.size.height * scale + (padding * 2)}px`,
                backgroundColor: originalIndex === searchResultState?.activeResultIndex
                  ? activeHighlightColor
                  : highlightColor,
                opacity: opacity,
                borderRadius: `${borderRadius}px`,
                transform: 'scale(1.02)',
                transformOrigin: 'center',
                transition: 'opacity 0.3s ease-in-out, background-color 0.2s ease-in-out',
                pointerEvents: 'none',
                boxShadow: originalIndex === searchResultState?.activeResultIndex
                  ? '0 0 0 1px rgba(255, 191, 0, 0.8)'
                  : 'none'
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}