import { useEffect, useImperativeHandle, useCallback, useRef } from 'react';
import { useRedaction as useEmbedPdfRedaction } from '@embedpdf/plugin-redaction/react';
import { useSearch } from '@embedpdf/plugin-search/react';
import { useAnnotation } from '@embedpdf/plugin-annotation/react';
import { PdfAnnotationSubtype, boundingRect, MatchFlag } from '@embedpdf/models';
import type { PdfRedactAnnoObject, SearchResult } from '@embedpdf/models';
import { useRedaction } from '@app/contexts/RedactionContext';
import { useActiveDocumentId } from '@app/components/viewer/useActiveDocumentId';
import { useAnnotationCapability } from '@embedpdf/plugin-annotation/react';
import { useDocumentReady } from '@app/components/viewer/hooks/useDocumentReady';
import type { SearchRedactOptions, SearchTextResult } from '@app/contexts/RedactionContext';

/**
 * Bridges between the EmbedPDF redaction plugin and the Stirling-PDF RedactionContext.
 * Uses the unified redaction mode (toggleRedact/enableRedact/endRedact).
 */
export function RedactionAPIBridge() {
  const activeDocumentId = useActiveDocumentId();
  const documentReady = useDocumentReady();

  // Don't render the inner component until we have a valid document ID and document is ready
  if (!activeDocumentId || !documentReady) {
    return null;
  }

  return <RedactionAPIBridgeInner documentId={activeDocumentId} />;
}

function RedactionAPIBridgeInner({ documentId }: { documentId: string }) {
  const { state, provides: redactionProvides } = useEmbedPdfRedaction(documentId);
  const { provides: searchProvides } = useSearch(documentId);
  const { provides: annotationCapability } = useAnnotationCapability();
  const { provides: annotationScope } = useAnnotation(documentId);
  const {
    redactionApiRef,
    setPendingCount,
    setActiveType,
    setIsRedacting,
    setBridgeReady,
    manualRedactColor
  } = useRedaction();

  // Cache search results from the last searchText call.
  const cachedSearchResults = useRef<SearchResult[]>([]);

  // Keep a ref to searchProvides so the unmount cleanup always has the latest value.
  const searchProvidesRef = useRef(searchProvides);
  useEffect(() => {
    searchProvidesRef.current = searchProvides;
  }, [searchProvides]);

  // Mark bridge as ready on mount, clear search highlights and cache on unmount.
  useEffect(() => {
    setBridgeReady(true);
    return () => {
      setBridgeReady(false);
      // Clear any lingering search highlights when the bridge tears down
      // (e.g. user navigates away from the Redact tool).
      searchProvidesRef.current?.stopSearch?.();
      cachedSearchResults.current = [];
    };
  }, [setBridgeReady]);

  // Sync EmbedPDF state to our context
  useEffect(() => {
    if (state) {
      setPendingCount(state.pendingCount ?? 0);
      setActiveType(state.activeType ?? null);
      setIsRedacting(state.isRedacting ?? false);
    }
  }, [state, setPendingCount, setActiveType, setIsRedacting]);

  // Synchronize manual redaction color with EmbedPDF
  useEffect(() => {
    const annotationApi = annotationCapability as any;
    if (annotationApi?.setToolDefaults) {
      annotationApi.setToolDefaults('redact', {
        type: PdfAnnotationSubtype.REDACT,
        strokeColor: manualRedactColor,
        color: manualRedactColor,
        overlayColor: manualRedactColor,
        fillColor: manualRedactColor,
        interiorColor: manualRedactColor,
        backgroundColor: manualRedactColor,
        opacity: 1
      });
    }
  }, [annotationCapability, manualRedactColor]);

  /**
   * Search and Redact: searchText implementation
   * Caches raw SearchResult[] for use by redactText
   */
  const handleSearchText = useCallback(async (
    text: string,
    options?: SearchRedactOptions,
  ): Promise<SearchTextResult> => {
    if (!searchProvides) {
      throw new Error('Search plugin not available');
    }

    // Build flags
    const flags: MatchFlag[] = [];
    if (options?.caseSensitive) {
      flags.push(MatchFlag.MatchCase);
    }
    if (options?.wholeWord) {
      flags.push(MatchFlag.MatchWholeWord);
    }

    // Set flags on the search scope
    searchProvides.setFlags(flags);

    // End any previous search session before starting a new one.
    // We call stopSearch only if we have a change or to be safe,
    // but starting a new search should be clean.
    searchProvides.stopSearch?.();

    // Start a fresh search session.
    searchProvides.startSearch();

    // Search all pages.
    // We add a tiny delay to ensure the search plugin has processed the stop/start cycle.
    // This addresses the issue where calling search twice results in 0 findings.
    await new Promise(resolve => setTimeout(resolve, 50));
    const searchResult = await searchProvides.searchAllPages(text).toPromise();

    const results = searchResult.results;
    cachedSearchResults.current = results;

    // Aggregate results for the UI
    const foundOnPages = [...new Set(results.map((r: { pageIndex: number }) => r.pageIndex + 1))].sort(
      (a: number, b: number) => a - b,
    );

    return {
      totalCount: results.length,
      foundOnPages,
    };
  }, [searchProvides]);

  /**
   * Clears search highlights and cached results
   */
  const handleClearSearch = useCallback(() => {
    if (searchProvides) {
      searchProvides.stopSearch?.();
    }
    cachedSearchResults.current = [];
  }, [searchProvides]);

  /**
   * Search and Redact: redactText implementation
   * Uses cached search results — does NOT re-search.
   */
  const handleRedactText = useCallback(async (
    _text: string,
    _options?: SearchRedactOptions,
  ): Promise<boolean> => {
    if (!annotationScope) {
      throw new Error('Annotation plugin not available');
    }

    const results = cachedSearchResults.current;
    if (results.length === 0) {
      return false;
    }

    // Create real REDACT annotations for each cached search result.
    let createdCount = 0;
    for (const result of results) {
      const bounding = boundingRect(result.rects);
      if (bounding) {
        const redactAnnotation: PdfRedactAnnoObject = {
          id: `search-redact-${result.pageIndex}-${result.charIndex}-${Date.now()}-${createdCount}`,
          type: PdfAnnotationSubtype.REDACT,
          pageIndex: result.pageIndex,
          rect: bounding,
          segmentRects: result.rects,
          color: manualRedactColor,
          strokeColor: manualRedactColor,
          opacity: 1,
        };

        annotationScope.createAnnotation(result.pageIndex, redactAnnotation);
        createdCount++;
      }
    }

    if (createdCount === 0) {
      return false;
    }

    // Clear cached results after creating annotations
    cachedSearchResults.current = [];

    return true;
  }, [annotationScope, manualRedactColor]);

  // Expose the EmbedPDF API through our context's ref
  useImperativeHandle(redactionApiRef, () => ({
    toggleRedact: () => {
      redactionProvides?.toggleRedact();
    },
    enableRedact: () => {
      redactionProvides?.enableRedact();
    },
    isRedactActive: () => {
      return redactionProvides?.isRedactActive() ?? false;
    },
    endRedact: () => {
      redactionProvides?.endRedact();
    },
    commitAllPending: () => {
      redactionProvides?.commitAllPending();
    },
    getActiveType: () => state?.activeType ?? null,
    getPendingCount: () => state?.pendingCount ?? 0,
    searchText: handleSearchText,
    redactText: handleRedactText,
    clearSearch: handleClearSearch,
  }), [redactionProvides, state, handleSearchText, handleRedactText, handleClearSearch]);

  return null;
}
