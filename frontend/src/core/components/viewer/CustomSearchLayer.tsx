import { useState, useEffect, useMemo } from 'react';
import { useDocumentState } from '@embedpdf/core/react';
import { useSearch } from '@embedpdf/plugin-search/react';
import { SEARCH_CONSTANTS } from '@app/components/viewer/constants/search';
import { useRedactionMode } from '@app/contexts/RedactionContext';

interface SearchLayerProps {
  documentId?: string;
  pageIndex: number;
  scale?: number;
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
  documentId = '',
  pageIndex,
  scale: scaleProp,
  highlightColor = SEARCH_CONSTANTS.HIGHLIGHT_COLORS.BACKGROUND,
  activeHighlightColor = SEARCH_CONSTANTS.HIGHLIGHT_COLORS.ACTIVE_BACKGROUND,
  opacity = SEARCH_CONSTANTS.HIGHLIGHT_COLORS.OPACITY,
  padding = SEARCH_CONSTANTS.UI.HIGHLIGHT_PADDING,
  borderRadius = 4
}: SearchLayerProps) {
  const { provides: searchProvides } = useSearch(documentId);
  const documentState = useDocumentState(documentId);
  // In redaction mode all highlights should be uniform — no active (orange) result,
  // since there is no next/previous navigation in the Search & Redact workflow.
  const { isRedactionModeActive } = useRedactionMode();
  const [searchResultState, setSearchResultState] = useState<SearchResultState | null>(null);

  // Use document scale from EmbedPDF state, fallback to prop, then to 1
  const scale = documentState?.scale ?? scaleProp ?? 1;

  // Subscribe to search result state changes
  useEffect(() => {
    if (!searchProvides) {
      return;
    }

    const unsubscribe = searchProvides.onSearchResultStateChange?.((state: SearchResultState) => {
      if (!state) return;
      // Only update state - do NOT auto-scroll here
      // Scrolling should only happen when user explicitly navigates via next/previous
      setSearchResultState(state);
    });


    return unsubscribe;
  }, [searchProvides, pageIndex]);

  // Filter results for current page while preserving original indices
  const pageResults = useMemo(() => {
    if (!searchResultState?.results) {
      return [];
    }

    const filtered = searchResultState.results
      .map((result, originalIndex) => ({ result, originalIndex }))
      .filter(({ result }) => result.pageIndex === pageIndex);

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
                backgroundColor: !isRedactionModeActive && originalIndex === searchResultState?.activeResultIndex
                  ? activeHighlightColor
                  : highlightColor,
                opacity: opacity,
                borderRadius: `${borderRadius}px`,
                transform: 'scale(1.02)',
                transformOrigin: 'center',
                transition: 'opacity 0.2s ease-in-out, background-color 0.2s ease-in-out',
                pointerEvents: 'none',
                boxShadow: !isRedactionModeActive && originalIndex === searchResultState?.activeResultIndex
                  ? `0 0 0 1px ${SEARCH_CONSTANTS.HIGHLIGHT_COLORS.ACTIVE_BACKGROUND}80`
                  : 'none'
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
