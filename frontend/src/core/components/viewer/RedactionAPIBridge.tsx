import { useEffect, useImperativeHandle, useCallback, useRef } from 'react';
import { useRedaction as useEmbedPdfRedaction } from '@embedpdf/plugin-redaction/react';
import { useSearch, useSearchPlugin } from '@embedpdf/plugin-search/react';
import { useAnnotation } from '@embedpdf/plugin-annotation/react';
import { PdfAnnotationSubtype, boundingRect, MatchFlag } from '@embedpdf/models';
import type { PdfRedactAnnoObject, Rect, PdfDocumentObject, PdfPageObject } from '@embedpdf/models';
import type { SearchResult } from '@embedpdf/models';
import { useRedaction } from '@app/contexts/RedactionContext';
import { useActiveDocumentId } from '@app/components/viewer/useActiveDocumentId';
import { useAnnotationCapability } from '@embedpdf/plugin-annotation/react';
import { useDocumentReady } from '@app/components/viewer/hooks/useDocumentReady';
import { useDocumentState } from '@embedpdf/core/react';
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
  const { plugin: searchPlugin } = useSearchPlugin();
  const { provides: annotationCapability } = useAnnotationCapability();
  const { provides: annotationScope } = useAnnotation(documentId);
  const documentState = useDocumentState(documentId);
  const {
    redactionApiRef,
    setPendingCount,
    setActiveType,
    setIsRedacting,
    setBridgeReady,
    manualRedactColor
  } = useRedaction();

  // Cache search results from the last searchText call.
  // redactText uses these cached results instead of re-searching.
  const cachedSearchResults = useRef<SearchResult[]>([]);

  // Mark bridge as ready on mount, not ready on unmount
  useEffect(() => {
    setBridgeReady(true);
    return () => {
      setBridgeReady(false);
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
   * Regex search: extracts text from each page via the engine,
   * then runs a JS RegExp to find matches and collect their rects.
   */
  const performRegexSearch = useCallback(async (
    pattern: string,
    options?: SearchRedactOptions,
  ): Promise<SearchResult[]> => {
    console.log('[RedactionBridge] Starting regex search for pattern:', pattern);

    // Access the PDF engine through the search plugin
    // engine is protected on BasePlugin but accessible at runtime via cast
    const engine = (searchPlugin as any)?.engine;
    if (!engine?.getPageTextRects) {
      console.error('[RedactionBridge] PDF engine not available. searchPlugin:', searchPlugin);
      console.error('[RedactionBridge] engine:', engine);
      console.error('[RedactionBridge] engine keys:', engine ? Object.keys(engine) : 'null');
      throw new Error('PDF engine not available for regex search');
    }

    // Get the document object from the document state hook
    const doc: PdfDocumentObject | null = (documentState as any)?.document ?? null;
    if (!doc) {
      console.error('[RedactionBridge] Document not loaded. documentState:', documentState);
      throw new Error('Document not loaded');
    }

    console.log('[RedactionBridge] Document loaded, pageCount:', doc.pageCount);

    const regexFlags = options?.caseSensitive ? 'g' : 'gi';
    const regex = new RegExp(pattern, regexFlags);

    const results: SearchResult[] = [];

    // Iterate all pages and extract text rects
    for (let pageIdx = 0; pageIdx < doc.pages.length; pageIdx++) {
      const page: PdfPageObject = doc.pages[pageIdx];

      try {
        const textRects = await engine.getPageTextRects(doc, page).toPromise();
        if (!textRects || textRects.length === 0) {
          console.log(`[RedactionBridge] Page ${pageIdx}: no text rects`);
          continue;
        }

        console.log(`[RedactionBridge] Page ${pageIdx}: ${textRects.length} text rects, sample:`, textRects[0]?.content);

        // Build a concatenated string and track char→rect mapping
        let fullText = '';
        const charMap: { rectIdx: number; charOffset: number }[] = [];

        for (let i = 0; i < textRects.length; i++) {
          const tr = textRects[i];
          for (let c = 0; c < tr.content.length; c++) {
            charMap.push({ rectIdx: i, charOffset: c });
          }
          fullText += tr.content;
        }

        console.log(`[RedactionBridge] Page ${pageIdx}: fullText length=${fullText.length}, snippet="${fullText.substring(0, 100)}"`);

        // Run regex on the full page text
        let match: RegExpExecArray | null;
        regex.lastIndex = 0;
        while ((match = regex.exec(fullText)) !== null) {
          if (match[0].length === 0) {
            regex.lastIndex++;
            continue;
          }
          const matchStart = match.index;
          const matchEnd = matchStart + match[0].length - 1;

          // Collect all rects that span this match
          const matchRects: Rect[] = [];
          const seenRectIndices = new Set<number>();

          for (let ci = matchStart; ci <= matchEnd; ci++) {
            if (ci < charMap.length) {
              const { rectIdx } = charMap[ci];
              if (!seenRectIndices.has(rectIdx)) {
                seenRectIndices.add(rectIdx);
                matchRects.push(textRects[rectIdx].rect);
              }
            }
          }

          if (matchRects.length > 0) {
            // Build context for the match
            const contextRadius = 30;
            const beforeStart = Math.max(0, matchStart - contextRadius);
            const afterEnd = Math.min(fullText.length, matchEnd + 1 + contextRadius);

            results.push({
              pageIndex: pageIdx,
              charIndex: matchStart,
              charCount: match[0].length,
              rects: matchRects,
              context: {
                before: fullText.slice(beforeStart, matchStart),
                match: match[0],
                after: fullText.slice(matchEnd + 1, afterEnd),
                truncatedLeft: beforeStart > 0,
                truncatedRight: afterEnd < fullText.length,
              },
            });
          }
        }
      } catch (err) {
        console.warn(`[RedactionBridge] Failed to extract text from page ${pageIdx}:`, err);
      }
    }

    console.log(`[RedactionBridge] Regex search complete. ${results.length} matches found.`);
    return results;
  }, [searchPlugin, documentState]);

  // Search and Redact: searchText implementation
  // Caches raw SearchResult[] for use by redactText
  const handleSearchText = useCallback(async (
    text: string,
    options?: SearchRedactOptions,
  ): Promise<SearchTextResult> => {
    let results: SearchResult[];

    if (options?.regex) {
      // Regex mode: use engine text extraction + client-side regex matching
      results = await performRegexSearch(text, options);
      cachedSearchResults.current = results;
    } else {
      // Normal mode: use EmbedPDF search plugin
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

      // Start a fresh search session, then search all pages
      searchProvides.startSearch();
      const searchResult = await searchProvides.searchAllPages(text).toPromise();

      results = searchResult.results;
      cachedSearchResults.current = results;
    }

    // Aggregate results for the UI
    const foundOnPages = [...new Set(results.map((r: { pageIndex: number }) => r.pageIndex + 1))].sort(
      (a: number, b: number) => a - b,
    );

    return {
      totalCount: results.length,
      foundOnPages,
    };
  }, [searchProvides, performRegexSearch]);

  // Search and Redact: redactText implementation
  // Uses cached search results — does NOT re-search.
  // Creates real REDACT annotations via the annotation plugin.
  // Does NOT call commitAllPending — the save flow in EmbedPdfViewer handles that.
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
    // The annotation plugin fires create events which the redaction plugin's
    // syncFromAnnotationCreate listener picks up, registering them as pending.
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
    // Common methods
    commitAllPending: () => {
      redactionProvides?.commitAllPending();
    },
    getActiveType: () => state?.activeType ?? null,
    getPendingCount: () => state?.pendingCount ?? 0,
    // Search and Redact methods
    searchText: handleSearchText,
    redactText: handleRedactText,
  }), [redactionProvides, state, handleSearchText, handleRedactText]);

  return null;
}
