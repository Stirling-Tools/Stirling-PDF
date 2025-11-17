import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Loader, Stack } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useIsMobile } from '@app/hooks/useIsMobile';
import {
  mapChangesForDropdown,
  getFileFromSelection,
  getStubFromSelection,
  computeShowProgressBanner,
  computeProgressPct,
  computeCountsText,
  computeMaxSharedPages,
} from '@app/components/tools/compare/compare';
import {
  CompareResultData,
  CompareWorkbenchData,
} from '@app/types/compare';
import { useFileContext } from '@app/contexts/file/fileHooks';
import { useRightRailButtons } from '@app/hooks/useRightRailButtons';
import CompareDocumentPane from '@app/components/tools/compare/CompareDocumentPane';
import { useComparePagePreviews } from '@app/components/tools/compare/hooks/useComparePagePreviews';
import { useComparePanZoom } from '@app/components/tools/compare/hooks/useComparePanZoom';
import { useCompareHighlights } from '@app/components/tools/compare/hooks/useCompareHighlights';
import { useCompareChangeNavigation } from '@app/components/tools/compare/hooks/useCompareChangeNavigation';
import '@app/components/tools/compare/compareView.css';
import { useCompareRightRailButtons } from '@app/components/tools/compare/hooks/useCompareRightRailButtons';
import { alert, updateToast, updateToastProgress, dismissToast } from '@app/components/toast';
import type { ToastLocation } from '@app/components/toast/types';

interface CompareWorkbenchViewProps {
  data: CompareWorkbenchData | null;
}

// helpers moved to compare.ts

const CompareWorkbenchView = ({ data }: CompareWorkbenchViewProps) => {
  const { t } = useTranslation();
  const prefersStacked = useIsMobile();
  const { selectors } = useFileContext();

  const result: CompareResultData | null = data?.result ?? null;
  const baseFileId = data?.baseFileId ?? null;
  const comparisonFileId = data?.comparisonFileId ?? null;
  const isOperationLoading = data?.isLoading ?? false;

  const baseFile = getFileFromSelection(data?.baseLocalFile, baseFileId, selectors);
  const comparisonFile = getFileFromSelection(data?.comparisonLocalFile, comparisonFileId, selectors);
  const baseStub = getStubFromSelection(baseFileId, selectors);
  const comparisonStub = getStubFromSelection(comparisonFileId, selectors);

  const processedAt = result?.totals.processedAt ?? null;

  const { pages: basePages, loading: baseLoading, totalPages: baseTotal, renderedPages: baseRendered } = useComparePagePreviews({
    file: baseFile,
    enabled: Boolean(result && baseFile),
    cacheKey: processedAt,
  });

  const { pages: comparisonPages, loading: comparisonLoading, totalPages: compTotal, renderedPages: compRendered } = useComparePagePreviews({
    file: comparisonFile,
    enabled: Boolean(result && comparisonFile),
    cacheKey: processedAt,
  });

  const {
    layout,
    toggleLayout,
    baseScrollRef,
    comparisonScrollRef,
    handleScrollSync,
    handleWheelZoom,
    handleWheelOverscroll,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    isPanMode,
    setIsPanMode,
    baseZoom,
    setBaseZoom,  
    comparisonZoom,
    setComparisonZoom,
    setPanToTopLeft,
    centerPanForZoom,
    clampPanForZoom,
    clearScrollLinkDelta,
    captureScrollLinkDelta,
    setIsScrollLinked,
    isScrollLinked,
    zoomLimits,
  } = useComparePanZoom({
    basePages,
    comparisonPages,
    prefersStacked,
  });

  const {
    baseWordChanges,
    comparisonWordChanges,
    metaIndexToGroupId,
    wordHighlightMaps,
    getRowHeightPx,
  } = useCompareHighlights(result, basePages, comparisonPages);

  const temporarilySuppressScrollLink = useCallback((fn: () => void, durationMs = 700) => {
    const wasLinked = isScrollLinked;
    if (wasLinked) setIsScrollLinked(false);
    try {
      fn();
    } finally {
      window.setTimeout(() => {
        if (wasLinked) {
          // recapture anchors to keep panes aligned when relinking
          captureScrollLinkDelta();
          setIsScrollLinked(true);
        }
      }, Math.max(200, durationMs));
    }
  }, [isScrollLinked, setIsScrollLinked, captureScrollLinkDelta]);

  const handleChangeNavigation = useCompareChangeNavigation(
    baseScrollRef,
    comparisonScrollRef,
    { temporarilySuppressScrollLink }
  );

  const processingMessage = t('compare.status.processing', 'Analyzing differences...');
  const baseDocumentLabel = t('compare.summary.baseHeading', 'Original document');
  const comparisonDocumentLabel = t('compare.summary.comparisonHeading', 'Edited document');
  const pageLabel = t('compare.summary.pageLabel', 'Page');

  // Always show the selected file names from the sidebar; they are known before diff results
  const baseTitle = baseStub?.name || result?.base?.fileName || '';
  const comparisonTitle = comparisonStub?.name || result?.comparison?.fileName || '';

  // During diff processing, show compact spinners in the dropdown badges
  const baseDropdownPlaceholder = (isOperationLoading || !result)
    ? (<span className="inline-flex flex-row items-center gap-1">{t('compare.dropdown.deletionsLabel', 'Deletions')} <Loader size="xs" color="currentColor" /></span>)
    : t('compare.dropdown.deletions', 'Deletions ({{count}})', { count: baseWordChanges.length });
  const comparisonDropdownPlaceholder = (isOperationLoading || !result)
    ? (<span className="inline-flex flex-row items-center gap-1">{t('compare.dropdown.additionsLabel', 'Additions')} <Loader size="xs" color="currentColor" /></span>)
    : t('compare.dropdown.additions', 'Additions ({{count}})', { count: comparisonWordChanges.length });

  const rightRailButtons = useCompareRightRailButtons({
    layout,
    toggleLayout,
    isPanMode,
    setIsPanMode,
    baseZoom,
    comparisonZoom,
    setBaseZoom,
    setComparisonZoom,
    setPanToTopLeft,
    centerPanForZoom,
    clampPanForZoom,
    clearScrollLinkDelta,
    captureScrollLinkDelta,
    isScrollLinked,
    setIsScrollLinked,
    zoomLimits,
    baseScrollRef,
    comparisonScrollRef,
  });

  useRightRailButtons(rightRailButtons);

  // Rendering progress toast for very large PDFs
  const LARGE_PAGE_THRESHOLD = 400; // show banner when one or both exceed threshold
  const totalsKnown = (baseTotal ?? 0) > 0 && (compTotal ?? 0) > 0;
  const showProgressBanner = useMemo(() => (
    computeShowProgressBanner(totalsKnown, baseTotal, compTotal, baseLoading, comparisonLoading, LARGE_PAGE_THRESHOLD)
  ), [totalsKnown, baseTotal, compTotal, baseLoading, comparisonLoading]);

  const progressPct = computeProgressPct(totalsKnown, baseTotal, compTotal, baseRendered, compRendered);

  const progressToastIdRef = useRef<string | null>(null);
  const completionTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (completionTimerRef.current != null) {
        window.clearTimeout(completionTimerRef.current);
        completionTimerRef.current = null;
      }
      if (progressToastIdRef.current) {
        dismissToast(progressToastIdRef.current);
        progressToastIdRef.current = null;
      }
    };
  }, []);

  const allDone = useMemo(() => {
    const baseDone = (baseTotal || basePages.length) > 0 && baseRendered >= (baseTotal || basePages.length);
    const compDone = (compTotal || comparisonPages.length) > 0 && compRendered >= (compTotal || comparisonPages.length);
    return baseDone && compDone;
  }, [baseRendered, compRendered, baseTotal, compTotal, basePages.length, comparisonPages.length]);

  // Drive toast lifecycle and progress updates
  useEffect(() => {
    // No toast needed
    if (!showProgressBanner) {
      if (progressToastIdRef.current) {
        dismissToast(progressToastIdRef.current);
        progressToastIdRef.current = null;
      }
      return;
    }

    const countsText = computeCountsText(
      baseRendered,
      baseTotal,
      basePages.length,
      compRendered,
      compTotal,
      comparisonPages.length,
    );
    if (!allDone) {
      // Create toast if missing
      if (!progressToastIdRef.current) {
        const id = alert({
          alertType: 'neutral',
          title: t('compare.rendering.inProgress', "At least one of these PDFs are very large, scrolling won't be smooth until the rendering is complete"),
          body: `${countsText} ${t('compare.rendering.pagesRendered', 'pages rendered')}`,
          location: 'bottom-right' as ToastLocation,
          isPersistentPopup: true,
          durationMs: 0,
          expandable: false,
          progressBarPercentage: progressPct,
        });
        progressToastIdRef.current = id;
      } else {
        updateToast(progressToastIdRef.current, {
          title: t('compare.rendering.inProgress', "At least one of these PDFs are very large, scrolling won't be smooth until the rendering is complete"),
          body: `${countsText} ${t('compare.rendering.pagesRendered', 'pages rendered')}`,
          location: 'bottom-right' as ToastLocation,
          isPersistentPopup: true,
          alertType: 'neutral', // ensure it stays neutral until completion
        });
        updateToastProgress(progressToastIdRef.current, progressPct);
      }
    } else {
      // Completed: update then auto-dismiss after 3s
      if (progressToastIdRef.current) {
        updateToast(progressToastIdRef.current, {
          title: t('compare.rendering.complete', 'Page rendering complete'),
          body: undefined,
          isPersistentPopup: false,
          durationMs: 3000,
        });
        updateToastProgress(progressToastIdRef.current, 100);
        if (completionTimerRef.current != null) window.clearTimeout(completionTimerRef.current);
        completionTimerRef.current = window.setTimeout(() => {
          if (progressToastIdRef.current) {
            dismissToast(progressToastIdRef.current);
            progressToastIdRef.current = null;
          }
          if (completionTimerRef.current != null) {
            window.clearTimeout(completionTimerRef.current);
            completionTimerRef.current = null;
          }
        }, 3000);
      }
    }

    return () => {
      if (completionTimerRef.current != null) {
        window.clearTimeout(completionTimerRef.current);
        completionTimerRef.current = null;
      }
    };
  }, [showProgressBanner, allDone, progressPct, baseRendered, compRendered, baseTotal, compTotal, basePages.length, comparisonPages.length, t]);

  // Shared page navigation state/input
  const maxSharedPages = useMemo(() => (
    computeMaxSharedPages(baseTotal, compTotal, basePages.length, comparisonPages.length)
  ), [baseTotal, compTotal, basePages.length, comparisonPages.length]);

  const [pageInputValue, setPageInputValue] = useState<string>('1');
  const typingTimerRef = useRef<number | null>(null);
  const isTypingRef = useRef(false);

  // Clamp the displayed input if max changes smaller than current
  useEffect(() => {
    if (!pageInputValue) return;
    const n = Math.max(1, parseInt(pageInputValue, 10) || 1);
    if (maxSharedPages > 0 && n > maxSharedPages) {
      setPageInputValue(String(maxSharedPages));
    }
  }, [maxSharedPages]);

  const scrollBothToPage = useCallback((pageNum: number) => {
    const scrollOne = (container: HTMLDivElement | null) => {
      if (!container) return false;
      const pageEl = container.querySelector(`.compare-diff-page[data-page-number="${pageNum}"]`) as HTMLElement | null;
      if (!pageEl) return false;
      const maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
      const desired = Math.max(0, Math.min(maxTop, pageEl.offsetTop - Math.round(container.clientHeight * 0.2)));
      container.scrollTop = desired;
      return true;
    };

    const hitBase = scrollOne(baseScrollRef.current);
    const hitComp = scrollOne(comparisonScrollRef.current);

    // Warn if one or both pages are not yet rendered
    const baseHas = basePages.some(p => p.pageNumber === pageNum);
    const compHas = comparisonPages.some(p => p.pageNumber === pageNum);
    if (!baseHas || !compHas) {
      alert({
        alertType: 'warning',
        title: t('compare.rendering.pageNotReadyTitle', 'Page not rendered yet'),
        body: t('compare.rendering.pageNotReadyBody', 'Some pages are still rendering. Navigation will snap once they are ready.'),
        location: 'bottom-right' as ToastLocation,
        isPersistentPopup: false,
        durationMs: 2500,
      });
    }

    return hitBase || hitComp;
  }, [basePages, comparisonPages, baseScrollRef, comparisonScrollRef, t]);

  const handleTypingChange = useCallback((next: string) => {
    // Only digits; allow empty while editing
    const digits = next.replace(/[^0-9]/g, '');
    if (digits.length === 0) {
      setPageInputValue('');
      if (typingTimerRef.current != null) {
        window.clearTimeout(typingTimerRef.current);
        typingTimerRef.current = null;
      }
      return;
    }

    const parsed = Math.max(1, parseInt(digits, 10));
    const capped = maxSharedPages > 0 ? Math.min(parsed, maxSharedPages) : parsed;
    const display = String(capped);
    setPageInputValue(display);

    isTypingRef.current = true;
    if (typingTimerRef.current != null) window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(() => {
      isTypingRef.current = false;
      scrollBothToPage(capped);
    }, 300);
  }, [maxSharedPages, scrollBothToPage]);

  return (
    <Stack className="compare-workbench">

        <Stack gap="lg" className="compare-workbench__content">
          <div
            className={`compare-workbench__columns ${layout === 'stacked' ? 'compare-workbench__columns--stacked' : ''}`}
          >
            <CompareDocumentPane
              pane="base"
              layout={layout}
              scrollRef={baseScrollRef}
              peerScrollRef={comparisonScrollRef}
              handleScrollSync={handleScrollSync}
              handleWheelZoom={handleWheelZoom}
              handleWheelOverscroll={handleWheelOverscroll}
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
              isPanMode={isPanMode}
              zoom={baseZoom}
              title={baseTitle}
              dropdownPlaceholder={baseDropdownPlaceholder}
              changes={mapChangesForDropdown(baseWordChanges)}
              onNavigateChange={(value, pageNumber) => handleChangeNavigation(value, 'base', pageNumber)}
              isLoading={isOperationLoading || baseLoading}
              processingMessage={processingMessage}
              pages={basePages}
              pairedPages={comparisonPages}
              getRowHeightPx={getRowHeightPx}
              wordHighlightMap={wordHighlightMaps.base}
              metaIndexToGroupId={metaIndexToGroupId.base}
              documentLabel={baseDocumentLabel}
              pageLabel={pageLabel}
              altLabel={baseDocumentLabel}
            pageInputValue={pageInputValue}
            onPageInputChange={handleTypingChange}
            maxSharedPages={maxSharedPages}
            />
            <CompareDocumentPane
              pane="comparison"
              layout={layout}
              scrollRef={comparisonScrollRef}
              peerScrollRef={baseScrollRef}
              handleScrollSync={handleScrollSync}
              handleWheelZoom={handleWheelZoom}
              handleWheelOverscroll={handleWheelOverscroll}
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
              isPanMode={isPanMode}
              zoom={comparisonZoom}
              title={comparisonTitle}
              dropdownPlaceholder={comparisonDropdownPlaceholder}
            changes={mapChangesForDropdown(comparisonWordChanges)}
              onNavigateChange={(value, pageNumber) => handleChangeNavigation(value, 'comparison', pageNumber)}
              isLoading={isOperationLoading || comparisonLoading}
              processingMessage={processingMessage}
              pages={comparisonPages}
              pairedPages={basePages}
              getRowHeightPx={getRowHeightPx}
              wordHighlightMap={wordHighlightMaps.comparison}
              metaIndexToGroupId={metaIndexToGroupId.comparison}
              documentLabel={comparisonDocumentLabel}
              pageLabel={pageLabel}
              altLabel={comparisonDocumentLabel}
            pageInputValue={pageInputValue}
            onPageInputChange={handleTypingChange}
            maxSharedPages={maxSharedPages}
            />
          </div>
        </Stack>
    </Stack>
  );
};

export default CompareWorkbenchView;
