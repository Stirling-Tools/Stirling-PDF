import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import LocalIcon from '@app/components/shared/LocalIcon';
import { Box, Group, Stack, Text, Button, Modal, ActionIcon } from '@mantine/core';
import { createToolFlow } from '@app/components/tools/shared/createToolFlow';
import { useBaseTool } from '@app/hooks/tools/shared/useBaseTool';
import { BaseToolProps, ToolComponent } from '@app/types/tool';
import {
  useCompareParameters,
  defaultParameters as compareDefaultParameters,
} from '@app/hooks/tools/compare/useCompareParameters';
import {
  useCompareOperation,
  CompareOperationHook,
} from '@app/hooks/tools/compare/useCompareOperation';
import CompareWorkbenchView from '@app/components/tools/compare/CompareWorkbenchView';
import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';
import { useNavigationActions } from '@app/contexts/NavigationContext';
import { useFileContext, useFileState } from '@app/contexts/file/fileHooks';
import type { FileId } from '@app/types/file';
import type { StirlingFile } from '@app/types/fileContext';
import DocumentThumbnail from '@app/components/shared/filePreview/DocumentThumbnail';
import type { CompareWorkbenchData } from '@app/types/compare';
import FitText from '@app/components/shared/FitText';
import { getDefaultWorkbench } from '@app/types/workbench';
import { useFilesModalContext } from '@app/contexts/FilesModalContext';

const CUSTOM_VIEW_ID = 'compareWorkbenchView';
const CUSTOM_WORKBENCH_ID = 'custom:compareWorkbenchView' as const;

const Compare = (props: BaseToolProps) => {
  const { t } = useTranslation();
  const { actions: navigationActions } = useNavigationActions();
  const {
    registerCustomWorkbenchView,
    unregisterCustomWorkbenchView,
    setCustomWorkbenchViewData,
    clearCustomWorkbenchViewData,
  } = useToolWorkflow();
  const { selectors, actions: fileActions } = useFileContext();
  const { state: fileState } = useFileState();
  const { openFilesModal } = useFilesModalContext();

  const base = useBaseTool(
    'compare',
    useCompareParameters,
    useCompareOperation,
    props,
    { minFiles: 2 }
  );

  const operation = base.operation as CompareOperationHook;
  const params = base.params.parameters;

  const compareIcon = useMemo(() => <LocalIcon icon="compare-rounded" width={20} height={20} />, []);
  const [swapConfirmOpen, setSwapConfirmOpen] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const performClearSelected = useCallback(() => {
    try { base.operation.cancelOperation(); } catch { console.error('Failed to cancel operation'); }
    try { base.operation.resetResults(); } catch { console.error('Failed to reset results'); }
    base.params.setParameters(prev => ({ ...prev, baseFileId: null, comparisonFileId: null }));
    try { fileActions.clearSelections(); } catch { console.error('Failed to clear selections'); }
    clearCustomWorkbenchViewData(CUSTOM_VIEW_ID);
    navigationActions.setWorkbench(getDefaultWorkbench());
  }, [base.operation, base.params, clearCustomWorkbenchViewData, fileActions, navigationActions]);

  useEffect(() => {
    const handler = () => {
      performClearSelected();
    };
    window.addEventListener('compare:clear-selected', handler as unknown as EventListener);
    return () => {
      window.removeEventListener('compare:clear-selected', handler as unknown as EventListener);
    };
  }, [performClearSelected]);


  useEffect(() => {
    registerCustomWorkbenchView({
      id: CUSTOM_VIEW_ID,
      workbenchId: CUSTOM_WORKBENCH_ID,
      // Use a static label at registration time to avoid re-registering on i18n changes
      label: 'Compare view',
      icon: compareIcon,
      component: CompareWorkbenchView,
    });

    return () => {
      unregisterCustomWorkbenchView(CUSTOM_VIEW_ID);
    };
  // Register once; avoid re-registering on translation/prop changes which clears data mid-flight
  }, []);

  // Auto-map from workbench selection: always reflect the first two selected files in order.
  // This also handles deselection by promoting the remaining selection to base and clearing comparison.
  useEffect(() => {
    // Use selected IDs directly from state so it works even if File objects aren't loaded yet
    const selectedIds = (fileState.ui.selectedFileIds as FileId[]) ?? [];

    // Determine next base: keep current if still selected; otherwise use the first selected id
    const nextBase: FileId | null = params.baseFileId && selectedIds.includes(params.baseFileId)
      ? (params.baseFileId as FileId)
      : (selectedIds[0] ?? null);

    // Determine next comparison: keep current if still selected and distinct; otherwise use the first other selected id
    let nextComp: FileId | null = null;
    if (params.comparisonFileId && selectedIds.includes(params.comparisonFileId) && params.comparisonFileId !== nextBase) {
      nextComp = params.comparisonFileId as FileId;
    } else {
      nextComp = (selectedIds.find(id => id !== nextBase) ?? null) as FileId | null;
    }

    if (nextBase !== params.baseFileId || nextComp !== params.comparisonFileId) {
      base.params.setParameters(prev => ({
        ...prev,
        baseFileId: nextBase,
        comparisonFileId: nextComp,
      }));
    }
  }, [fileState.ui.selectedFileIds, base.params, params.baseFileId, params.comparisonFileId]);

  // Track workbench data and drive loading/result state transitions
  const lastProcessedAtRef = useRef<number | null>(null);
  const lastWorkbenchDataRef = useRef<CompareWorkbenchData | null>(null);

  const updateWorkbenchData = useCallback(
    (data: CompareWorkbenchData) => {
      const previous = lastWorkbenchDataRef.current;
      if (
        previous &&
        previous.result === data.result &&
        previous.baseFileId === data.baseFileId &&
        previous.comparisonFileId === data.comparisonFileId &&
        previous.isLoading === data.isLoading &&
        previous.baseLocalFile === data.baseLocalFile &&
        previous.comparisonLocalFile === data.comparisonLocalFile
      ) {
        return;
      }
      lastWorkbenchDataRef.current = data;
      setCustomWorkbenchViewData(CUSTOM_VIEW_ID, data);
    },
    [setCustomWorkbenchViewData]
  );

  const prepareWorkbenchForRun = useCallback(
    (
      baseId: FileId | null,
      compId: FileId | null,
      options?: { baseFile?: StirlingFile | null; comparisonFile?: StirlingFile | null }
    ) => {
      if (!baseId || !compId) {
        return;
      }

      const previous = lastWorkbenchDataRef.current;
      const resolvedBaseFile =
        options?.baseFile ??
        (baseId ? selectors.getFile(baseId) : null) ??
        previous?.baseLocalFile ??
        null;
      const resolvedComparisonFile =
        options?.comparisonFile ??
        (compId ? selectors.getFile(compId) : null) ??
        previous?.comparisonLocalFile ??
        null;

      updateWorkbenchData({
        result: null,
        baseFileId: baseId,
        comparisonFileId: compId,
        baseLocalFile: resolvedBaseFile,
        comparisonLocalFile: resolvedComparisonFile,
        isLoading: true,
      });

      lastProcessedAtRef.current = null;
    },
    [selectors, updateWorkbenchData]
  );

  useEffect(() => {
    const baseFileId = params.baseFileId as FileId | null;
    const comparisonFileId = params.comparisonFileId as FileId | null;

    if (!baseFileId || !comparisonFileId) {
      lastProcessedAtRef.current = null;
      lastWorkbenchDataRef.current = null;
      clearCustomWorkbenchViewData(CUSTOM_VIEW_ID);
      return;
    }

    const result = operation.result;
    const processedAt = result?.totals.processedAt ?? null;

    if (
      result &&
      processedAt !== null &&
      processedAt !== lastProcessedAtRef.current &&
      result.base.fileId === baseFileId &&
      result.comparison.fileId === comparisonFileId
    ) {
      const previous = lastWorkbenchDataRef.current;
      const baseLocalFile =
        (baseFileId ? selectors.getFile(baseFileId) : null) ??
        previous?.baseLocalFile ??
        null;
      const comparisonLocalFile =
        (comparisonFileId ? selectors.getFile(comparisonFileId) : null) ??
        previous?.comparisonLocalFile ??
        null;
      updateWorkbenchData({
        result,
        baseFileId,
        comparisonFileId,
        baseLocalFile,
        comparisonLocalFile,
        isLoading: false,
      });
      lastProcessedAtRef.current = processedAt;
      return;
    }

    if (base.operation.isLoading) {
      const previous = lastWorkbenchDataRef.current;
      const baseLocalFile =
        (baseFileId ? selectors.getFile(baseFileId) : null) ??
        previous?.baseLocalFile ??
        null;
      const comparisonLocalFile =
        (comparisonFileId ? selectors.getFile(comparisonFileId) : null) ??
        previous?.comparisonLocalFile ??
        null;
      updateWorkbenchData({
        result: null,
        baseFileId,
        comparisonFileId,
        baseLocalFile,
        comparisonLocalFile,
        isLoading: true,
      });
      return;
    }
  }, [
    base.operation.isLoading,
    clearCustomWorkbenchViewData,
    operation.result,
    params.baseFileId,
    params.comparisonFileId,
    selectors,
    updateWorkbenchData,
  ]);

  const handleExecuteCompare = useCallback(async () => {
    const baseId = params.baseFileId as FileId | null;
    const compId = params.comparisonFileId as FileId | null;
    const baseSel =
      base.selectedFiles.find((file) => file.fileId === baseId) ??
      (baseId ? selectors.getFile(baseId) : null);
    const compSel =
      base.selectedFiles.find((file) => file.fileId === compId) ??
      (compId ? selectors.getFile(compId) : null);
    const selected: StirlingFile[] = [];
    if (baseSel) selected.push(baseSel);
    if (compSel) selected.push(compSel);

    prepareWorkbenchForRun(baseId, compId, { baseFile: baseSel ?? null, comparisonFile: compSel ?? null });
    if (baseId && compId) {
      requestAnimationFrame(() => {
        navigationActions.setWorkbench(CUSTOM_WORKBENCH_ID);
      });
    }

    await operation.executeOperation(
      { ...params },
      selected
    );
  }, [base.selectedFiles, navigationActions, operation, params, prepareWorkbenchForRun, selectors]);

  // Run compare with explicit ids (used after swap so we don't depend on async state propagation)
  const runCompareWithIds = useCallback(async (baseId: FileId | null, compId: FileId | null) => {
    const nextParams = { ...params, baseFileId: baseId, comparisonFileId: compId };
    const selected: StirlingFile[] = [];
    const baseSel =
      base.selectedFiles.find((file) => file.fileId === baseId) ??
      (baseId ? selectors.getFile(baseId) : null);
    const compSel =
      base.selectedFiles.find((file) => file.fileId === compId) ??
      (compId ? selectors.getFile(compId) : null);
    if (baseSel) selected.push(baseSel);
    if (compSel) selected.push(compSel);
    prepareWorkbenchForRun(baseId, compId, { baseFile: baseSel ?? null, comparisonFile: compSel ?? null });
    await operation.executeOperation(nextParams, selected);
  }, [base.selectedFiles, operation, params, prepareWorkbenchForRun, selectors]);

  const performSwap = useCallback(() => {
    const baseId = params.baseFileId as FileId | null;
    const compId = params.comparisonFileId as FileId | null;
    if (!baseId || !compId) return;
    base.params.setParameters((prev) => ({
      ...prev,
      baseFileId: compId,
      comparisonFileId: baseId,
    }));
    if (operation.result) {
      runCompareWithIds(compId, baseId);
    }
  }, [base.params, operation.result, params.baseFileId, params.comparisonFileId, runCompareWithIds]);

  // No custom handler; rely on global add flow which auto-selects added files

  const handleSwap = useCallback(() => {
    const baseId = params.baseFileId as FileId | null;
    const compId = params.comparisonFileId as FileId | null;
    if (!baseId || !compId) return;
    if (operation.result) {
      setSwapConfirmOpen(true);
      return;
    }
    performSwap();
  }, [operation.result, params.baseFileId, params.comparisonFileId, performSwap]);

  const renderSelectedFile = useCallback(
    (role: 'base' | 'comparison') => {
      const fileId = role === 'base' ? params.baseFileId : params.comparisonFileId;
      const stub = fileId ? selectors.getStirlingFileStub(fileId) : undefined;
      
      // Show add button in base if no base file, or in comparison if base exists but no comparison
      const shouldShowAddButton = 
        (role === 'base' && !params.baseFileId) || 
        (role === 'comparison' && params.baseFileId && !params.comparisonFileId);

      if (!stub) {
        return (
        <Stack gap={6}>
            <Box
              style={{
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                padding: '0.75rem 1rem',
                background: 'var(--bg-surface)',
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: shouldShowAddButton ? 'pointer' : 'default',
              }}
              onClick={shouldShowAddButton ? () => openFilesModal({}) : undefined}
            >
              <Text size="sm" c="dimmed">
                {t(
                  role === 'base' ? 'compare.original.placeholder' : 'compare.edited.placeholder',
                  role === 'base' ? 'Select the original PDF' : 'Select the edited PDF'
                )}
              </Text>
              {shouldShowAddButton && (
                <ActionIcon
                  variant="filled"
                  color="blue"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    openFilesModal({});
                  }}
                  style={{ flexShrink: 0 }}
                >
                  <LocalIcon icon="add-rounded" width={20} height={20} />
                </ActionIcon>
              )}
            </Box>
          </Stack>
        );
      }
      // Build compact meta line for pages and date
      const dateMs = (stub?.lastModified || stub?.createdAt) ?? null;
      const dateText = dateMs
        ? new Date(dateMs).toLocaleDateString(undefined, { month: 'short', day: '2-digit', year: 'numeric' })
        : '';
      const pageCount = stub?.processedFile?.totalPages || null;

      return (
        <Stack gap={6}>
          <Box
            style={{
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              padding: '0.75rem 1rem',
              background: 'var(--bg-surface)',
              width: '100%',
              minHeight: "9rem"

            }}
          >
            <Group align="flex-start" wrap="nowrap" gap="md">
              <Box className="compare-tool__thumbnail" style={{ alignSelf: 'center' }}>
                <DocumentThumbnail file={stub ?? null} thumbnail={stub?.thumbnailUrl || null} />
              </Box>
              <Stack className="compare-tool__details">
                <FitText 
                  text={stub?.name || ''} 
                  minimumFontScale={0.8} 
                  lines={3}
                  style={{ fontWeight: 600
                  }}
                />
                {pageCount && dateText && (
                  <>
                  <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {pageCount} {t('compare.pages', 'pages')}
                    <br />
                    {dateText}
                </Text>
                  </>
                )}
              </Stack>
            </Group>
          </Box>
        </Stack>
      );
    },
    [params.baseFileId, params.comparisonFileId, selectors, t, openFilesModal]
  );

  const baseStub = params.baseFileId ? selectors.getStirlingFileStub(params.baseFileId) : undefined;
  const compStub = params.comparisonFileId ? selectors.getStirlingFileStub(params.comparisonFileId) : undefined;
  const canExecute = Boolean(
    params.baseFileId &&
    params.comparisonFileId &&
    params.baseFileId !== params.comparisonFileId &&
    baseStub &&
    compStub &&
    !base.operation.isLoading &&
    base.endpointEnabled !== false
  );

  const hasBothSelected = Boolean(params.baseFileId && params.comparisonFileId);
  const hasAnyFiles = selectors.getFiles().length > 0;

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: false,
    },
    steps: [
      {
        title: t('compare.selection.originalEditedTitle', 'Select Original and Edited PDFs'),
        isVisible: true,
        content: (
          <Box
            style={{
              display: 'grid',
              gridTemplateColumns: hasBothSelected ? '1fr 2.25rem' : '1fr',
              gap: '1rem',
              alignItems: 'stretch',
              width: '100%', 
            }}
          >
            {/* Header row: Original PDF + Clear selected aligned to swap column */}
            <Box
              style={{ gridColumn: hasBothSelected ? '1 / span 2' : '1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.5rem' }}
            >
              <Text fw={700} size="sm">{t('compare.original.label', 'Original PDF')}</Text>
              <Button
                variant="subtle"
                size="compact-xs"
                onClick={() => setClearConfirmOpen(true)}
                disabled={!hasAnyFiles}
                styles={{ root: { textDecoration: 'underline' } }}
                style={{
                  background: !hasAnyFiles ? 'transparent' : undefined,
                  color: !hasAnyFiles ? 'var(--spdf-clear-disabled-text)' : undefined
                }}
              >
                {t('compare.clearSelected', 'Clear selected')}
              </Button>
            </Box>
            <Box
              style={{
                gridColumn: '1',
                minWidth: 0,
                
              }}
            >
              {renderSelectedFile('base')}
              <div style={{ height: '0.75rem' }} />
              {/* Edited PDF section header */}
              <Text fw={700} size="sm" style={{ marginBottom: '1rem', marginTop: '0.5rem'}}>{t('compare.edited.label', 'Edited PDF')}</Text>
              {renderSelectedFile('comparison')}
            </Box>
            {hasBothSelected && (
            <Box
              style={{
                gridColumn: '2',
                gridRow: '2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                alignSelf: 'stretch',
              }}
            >
              <Button
                variant="subtle"
                onClick={handleSwap}
                disabled={!hasBothSelected || base.operation.isLoading}
                style={{
                  width: '2.25rem',
                  height: '100%',
                  padding: 0,
                  borderRadius: '0.5rem',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-default)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <LocalIcon icon="swap-vert-rounded" width={24} height={24} />
              </Button>
            </Box>
            )}
            <Modal
              opened={swapConfirmOpen}
              onClose={() => setSwapConfirmOpen(false)}
              title={t('compare.swap.confirmTitle', 'Re-run comparison?')}
              centered
              size="sm"
            >
              <Stack gap="md">
                <Text>{t('compare.swap.confirmBody', 'This will rerun the tool. Are you sure you want to swap the order of Original and Edited?')}</Text>
                <Group justify="flex-end" gap="sm">
                  <Button variant="light" onClick={() => setSwapConfirmOpen(false)}>{t('cancel', 'Cancel')}</Button>
                  <Button
                    variant="filled"
                    onClick={() => {
                      setSwapConfirmOpen(false);
                      performSwap();
                    }}
                  >
                    {t('compare.swap.confirm', 'Swap and Re-run')}
                  </Button>
                </Group>
              </Stack>
            </Modal>
            <Modal
              opened={clearConfirmOpen}
              onClose={() => setClearConfirmOpen(false)}
              title={t('compare.clear.confirmTitle', 'Clear selected PDFs?')}
              centered
              size="sm"
            >
              <Stack gap="md">
                <Text>{t('compare.clear.confirmBody', 'This will close the current comparison and take you back to Active Files.')}</Text>
                <Group justify="flex-end" gap="sm">
                  <Button variant="light" onClick={() => setClearConfirmOpen(false)}>{t('cancel', 'Cancel')}</Button>
                  <Button
                    variant="filled"
                    onClick={() => {
                      setClearConfirmOpen(false);
                      performClearSelected();
                    }}
                  >
                    {t('compare.clear.confirm', 'Clear and return')}
                  </Button>
                </Group>
              </Stack>
            </Modal>
          </Box>
        ),
      },
    ],
    executeButton: {
      text: t('compare.cta', 'Compare'),
      loadingText: t('compare.loading', 'Comparing...'),
      onClick: handleExecuteCompare,
      disabled: !canExecute,
      testId: 'compare-execute',
    },
    review: {
      isVisible: false,
      operation: base.operation,
      title: t('compare.review.title', 'Comparison Result'),
      onUndo: base.operation.undoOperation,
    },
  });
};

const CompareTool = Compare as ToolComponent;
CompareTool.tool = () => useCompareOperation;
CompareTool.getDefaultParameters = () => ({ ...compareDefaultParameters });

export default CompareTool;



