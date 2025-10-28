import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Progress, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from '@mantine/hooks';
import {
  CompareResultData,
} from '../../../types/compare';
import type { CompareWorkbenchData } from '../../../types/compareWorkbench';
import type { FileId } from '../../../types/file';
import type { StirlingFileStub, StirlingFile } from '../../../types/fileContext';
import { useFilesModalContext } from '../../../contexts/FilesModalContext';
import { useFileActions, useFileContext } from '../../../contexts/file/fileHooks';
import { useRightRailButtons } from '../../../hooks/useRightRailButtons';
import CompareDocumentPane from './CompareDocumentPane';
import CompareUploadSection from './CompareUploadSection';
import { useComparePagePreviews } from './hooks/useComparePagePreviews';
import { useComparePanZoom } from './hooks/useComparePanZoom';
import { useCompareHighlights } from './hooks/useCompareHighlights';
import { useCompareChangeNavigation } from './hooks/useCompareChangeNavigation';
import type { CompareChangeOption } from '../../../types/compareWorkbench';
import './compareView.css';
import { useCompareRightRailButtons } from './hooks/useCompareRightRailButtons';

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
  const prefersStacked = useMediaQuery('(max-width: 1024px)') ?? false;
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
  const emptyMessage = t('compare.view.noData', 'Run a comparison to view the summary and diff.');
  const baseDocumentLabel = t('compare.summary.baseHeading', 'Base document');
  const comparisonDocumentLabel = t('compare.summary.comparisonHeading', 'Comparison document');
  const pageLabel = t('compare.summary.pageLabel', 'Page');

  const handleFilesAdded = useCallback(async (files: File[], role: 'base' | 'comparison') => {
      if (!files.length || isOperationLoading) {
        return;
      }
      try {
      const added = await fileActions.addFiles(files, { selectFiles: false });
        const primary = added[0];
        if (!primary) {
          return;
        }
        if (role === 'base') {
          onSelectBase?.(primary.fileId as FileId);
        } else {
          onSelectComparison?.(primary.fileId as FileId);
        }
      } catch (error) {
        console.error('[compare] failed to add files from workbench dropzone', error);
      }
  }, [fileActions, isOperationLoading, onSelectBase, onSelectComparison]);

  const handleSelectFromLibrary = useCallback((role: 'base' | 'comparison') => {
      if (isOperationLoading) {
        return;
      }
      openFilesModal({
        customHandler: async (files: File[]) => {
          await handleFilesAdded(files, role);
        },
      });
  }, [handleFilesAdded, isOperationLoading, openFilesModal]);

  const handleClearSelection = useCallback((role: 'base' | 'comparison') => {
      if (isOperationLoading) {
        return;
      }
      if (role === 'base') {
        onSelectBase?.(null);
      } else {
        onSelectComparison?.(null);
      }
  }, [isOperationLoading, onSelectBase, onSelectComparison]);

  const uploadSection = (
    <CompareUploadSection
      heading={t('compare.upload.title', 'Set up your comparison')}
      subheading={t(
            'compare.upload.subtitle',
            'Add a base document on the left and a comparison document on the right to highlight their differences.'
          )}
      disabled={isOperationLoading}
      base={getUploadConfig(
        'base',
        baseFile,
        baseStub,
        t('compare.upload.baseTitle', 'Base document'),
        t('compare.upload.baseDescription', 'This version acts as the reference for differences.'),
        'compare-upload-icon--base',
        (files) => handleFilesAdded(files, 'base'),
        () => handleSelectFromLibrary('base'),
        () => handleClearSelection('base'),
        isOperationLoading,
      )}
      comparison={getUploadConfig(
        'comparison',
        comparisonFile,
        comparisonStub,
        t('compare.upload.comparisonTitle', 'Comparison document'),
        t('compare.upload.comparisonDescription', 'Differences from this version will be highlighted.'),
        'compare-upload-icon--comparison',
        (files) => handleFilesAdded(files, 'comparison'),
        () => handleSelectFromLibrary('comparison'),
        () => handleClearSelection('comparison'),
        isOperationLoading,
      )}
    />
  );

  if (!result) {
    return uploadSection;
  }

  const baseTitle = baseLoading
    ? `${result.base.fileName} - ${t('loading', 'Loading')}…`
    : `${result.base.fileName} - ${basePages.length} pages`;
  const comparisonTitle = comparisonLoading
    ? `${result.comparison.fileName} - ${t('loading', 'Loading')}…`
    : `${result.comparison.fileName} - ${comparisonPages.length} pages`;
  const baseDropdownPlaceholder = t('compare.dropdown.deletions', 'Deletions ({{count}})', {
    count: baseWordChanges.length,
  });
  const comparisonDropdownPlaceholder = t('compare.dropdown.additions', 'Additions ({{count}})', {
    count: comparisonWordChanges.length,
  });

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

  // Rendering progress banner for very large PDFs
  const LARGE_PAGE_THRESHOLD = 400; // show banner when one or both exceed threshold
  const showProgressBanner = useMemo(() => {
    const totals = [baseTotal || basePages.length, compTotal || comparisonPages.length];
    return Math.max(...totals) >= LARGE_PAGE_THRESHOLD && (baseLoading || comparisonLoading);
  }, [baseTotal, compTotal, basePages.length, comparisonPages.length, baseLoading, comparisonLoading]);

  const totalCombined = (baseTotal || basePages.length) + (compTotal || comparisonPages.length);
  const renderedCombined = baseRendered + compRendered;
  const progressPct = totalCombined > 0 ? Math.min(100, Math.round((renderedCombined / totalCombined) * 100)) : 0;

  const [hideBannerAfterDone, setHideBannerAfterDone] = useState(false);
  const completionTimerRef = useRef<number | null>(null);

  const allDone = useMemo(() => {
    const baseDone = (baseTotal || basePages.length) > 0 && baseRendered >= (baseTotal || basePages.length);
    const compDone = (compTotal || comparisonPages.length) > 0 && compRendered >= (compTotal || comparisonPages.length);
    return baseDone && compDone;
  }, [baseRendered, compRendered, baseTotal, compTotal, basePages.length, comparisonPages.length]);

  if (allDone && completionTimerRef.current == null && showProgressBanner) {
    completionTimerRef.current = window.setTimeout(() => {
      setHideBannerAfterDone(true);
      if (completionTimerRef.current != null) {
        window.clearTimeout(completionTimerRef.current);
        completionTimerRef.current = null;
      }
    }, 3000);
  }

  return (
    <Stack className="compare-workbench">
      {showProgressBanner && !hideBannerAfterDone && (
        <Alert color="yellow" variant="light">
          <Stack gap={6}>
            {!allDone ? (
              <>
                <Text size="sm">
                  {t('compare.rendering.inProgress', 'One or both of these PDFs are very large, scrolling won\'t be smooth until the rendering is complete')}
                </Text>
                <Text size="sm">
                  {`${baseRendered}/${baseTotal || basePages.length} • ${compRendered}/${compTotal || comparisonPages.length} ${t('compare.rendering.pagesRendered', 'pages rendered')}`}
                </Text>
                <Progress value={progressPct} animated size="sm" />
              </>
            ) : (
              <>
                <Text size="sm">{t('compare.rendering.complete', 'Page rendering complete')}</Text>
                <Progress value={100} size="sm" />
              </>
            )}
          </Stack>
        </Alert>
      )}

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
              isLoading={baseLoading}
              processingMessage={processingMessage}
              emptyMessage={emptyMessage}
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
              isLoading={comparisonLoading}
              processingMessage={processingMessage}
              emptyMessage={emptyMessage}
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
