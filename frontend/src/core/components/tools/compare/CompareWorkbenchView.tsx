import { useEffect, useMemo, useRef } from 'react';
import { Loader, Stack } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useIsMobile } from '@app/hooks/useIsMobile';
import {
  CompareResultData,
  CompareWorkbenchData,
  CompareChangeOption,
} from '@app/types/compare';
import type { FileId } from '@app/types/file';
import type { StirlingFileStub, StirlingFile } from '@app/types/fileContext';
import { useFilesModalContext } from '@app/contexts/FilesModalContext';
import { useFileActions, useFileContext } from '@app/contexts/file/fileHooks';
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

const getFileFromSelection = (
  explicit: StirlingFile | null | undefined,
  fileId: FileId | null,
  selectors: ReturnType<typeof useFileContext>['selectors'],
) => {
  if (explicit) return explicit;
  if (!fileId) return null;
  return selectors.getFile(fileId) ?? null;
};

const getStubFromSelection = (
  fileId: FileId | null,
  selectors: ReturnType<typeof useFileContext>['selectors'],
) => {
  if (!fileId) return null;
  return selectors.getStirlingFileStub(fileId) ?? null;
};

const getUploadConfig = (
  role: 'base' | 'comparison',
  file: File | null,
  stub: StirlingFileStub | null,
  title: string,
  description: string,
  accentClass: string,
  onDrop: (files: File[]) => void,
  onSelectExisting: () => void,
  onClear: () => void,
  disabled: boolean,
) => ({
  role,
  file,
  stub,
  title,
  description,
  accentClass,
  onDrop,
  onSelectExisting,
  onClear,
  disabled,
});

const mapChangesForDropdown = (changes: CompareChangeOption[]) =>
  changes.map(({ value, label, pageNumber }) => ({ value, label, pageNumber }));

const CompareWorkbenchView = ({ data }: CompareWorkbenchViewProps) => {
  const { t } = useTranslation();
  const prefersStacked = useIsMobile();
  const { openFilesModal } = useFilesModalContext();
  const { actions: fileActions } = useFileActions();
  const { selectors } = useFileContext();

  const result: CompareResultData | null = data?.result ?? null;
  const baseFileId = data?.baseFileId ?? null;
  const comparisonFileId = data?.comparisonFileId ?? null;
  const onSelectBase = data?.onSelectBase;
  const onSelectComparison = data?.onSelectComparison;
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
    beginPan,
    continuePan,
    endPan,
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
    basePan,
    comparisonPan,
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

  const handleChangeNavigation = useCompareChangeNavigation(
    baseScrollRef,
    comparisonScrollRef
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
    centerPanForZoom,
    clampPanForZoom,
    clearScrollLinkDelta,
    captureScrollLinkDelta,
    isScrollLinked,
    setIsScrollLinked,
    zoomLimits,
  });

  useRightRailButtons(rightRailButtons);

  // Rendering progress toast for very large PDFs
  const LARGE_PAGE_THRESHOLD = 400; // show banner when one or both exceed threshold
  const totalsKnown = (baseTotal ?? 0) > 0 && (compTotal ?? 0) > 0;
  const showProgressBanner = useMemo(() => {
    if (!totalsKnown) return false; // avoid premature 100% before totals are known
    const totals = [baseTotal!, compTotal!];
    return Math.max(...totals) >= LARGE_PAGE_THRESHOLD && (baseLoading || comparisonLoading);
  }, [totalsKnown, baseTotal, compTotal, baseLoading, comparisonLoading]);

  const totalCombined = totalsKnown ? (baseTotal! + compTotal!) : 0;
  const renderedCombined = baseRendered + compRendered;
  const progressPct = totalsKnown && totalCombined > 0
    ? Math.min(100, Math.round((renderedCombined / totalCombined) * 100))
    : 0;

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

    const countsText = `${baseRendered}/${baseTotal || basePages.length} • ${compRendered}/${compTotal || comparisonPages.length}`;
    if (!allDone) {
      // Create toast if missing
      if (!progressToastIdRef.current) {
        const id = alert({
          alertType: 'neutral',
          title: t('compare.rendering.inProgress', "One or both of these PDFs are very large, scrolling won't be smooth until the rendering is complete"),
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
          title: t('compare.rendering.inProgress', "One or both of these PDFs are very large, scrolling won't be smooth until the rendering is complete"),
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
              beginPan={beginPan}
              continuePan={continuePan}
              endPan={endPan}
              handleWheelZoom={handleWheelZoom}
              handleWheelOverscroll={handleWheelOverscroll}
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
              isPanMode={isPanMode}
              zoom={baseZoom}
            pan={basePan}
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
            />
            <CompareDocumentPane
              pane="comparison"
              layout={layout}
              scrollRef={comparisonScrollRef}
              peerScrollRef={baseScrollRef}
              handleScrollSync={handleScrollSync}
              beginPan={beginPan}
              continuePan={continuePan}
              endPan={endPan}
              handleWheelZoom={handleWheelZoom}
              handleWheelOverscroll={handleWheelOverscroll}
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
              isPanMode={isPanMode}
              zoom={comparisonZoom}
            pan={comparisonPan}
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
            />
          </div>
        </Stack>
    </Stack>
  );
};

export default CompareWorkbenchView;
