import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import CompareRoundedIcon from '@mui/icons-material/CompareRounded';
import { Box, Group, Stack, Text, Button, Modal } from '@mantine/core';
import SwapVertRoundedIcon from '@mui/icons-material/SwapVertRounded';
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
import { useFileContext } from '@app/contexts/file/fileHooks';
import type { FileId } from '@app/types/file';
import type { StirlingFile } from '@app/types/fileContext';
import DocumentThumbnail from '@app/components/shared/filePreview/DocumentThumbnail';
import type { CompareWorkbenchData } from '@app/types/compare';
import FitText from '@app/components/shared/FitText';

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
  const { selectors } = useFileContext();

  const base = useBaseTool(
    'compare',
    useCompareParameters,
    useCompareOperation,
    props,
    { minFiles: 2 }
  );

  const operation = base.operation as CompareOperationHook;
  const params = base.params.parameters;

  const compareIcon = useMemo(() => <CompareRoundedIcon fontSize="small" />, []);
  const [swapConfirmOpen, setSwapConfirmOpen] = useState(false);

  useEffect(() => {
    registerCustomWorkbenchView({
      id: CUSTOM_VIEW_ID,
      workbenchId: CUSTOM_WORKBENCH_ID,
      // Use a static label at registration time to avoid re-registering on i18n changes
      label: 'Compare view',
      icon: compareIcon,
      component: CompareWorkbenchView as any,
    });

    return () => {
      unregisterCustomWorkbenchView(CUSTOM_VIEW_ID);
    };
  // Register once; avoid re-registering on translation/prop changes which clears data mid-flight
  }, []);

  // Auto-map from workbench selection: always reflect the first two selected files in order.
  // This also handles deselection by promoting the remaining selection to base and clearing comparison.
  useEffect(() => {
    const selectedIds = base.selectedFiles.map(f => f.fileId as FileId);

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
  }, [base.selectedFiles, base.params, params.baseFileId, params.comparisonFileId]);

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
    (baseId: FileId | null, compId: FileId | null) => {
      if (!baseId || !compId) {
        return;
      }

      updateWorkbenchData({
        result: null,
        baseFileId: baseId,
        comparisonFileId: compId,
        baseLocalFile: lastWorkbenchDataRef.current?.baseLocalFile ?? null,
        comparisonLocalFile: lastWorkbenchDataRef.current?.comparisonLocalFile ?? null,
        isLoading: true,
      });

      lastProcessedAtRef.current = null;
    },
    [operation.result, updateWorkbenchData]
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
      updateWorkbenchData({
        result,
        baseFileId,
        comparisonFileId,
        baseLocalFile: null,
        comparisonLocalFile: null,
        isLoading: false,
      });
      lastProcessedAtRef.current = processedAt;
      return;
    }

    if (base.operation.isLoading) {
      updateWorkbenchData({
        result: null,
        baseFileId,
        comparisonFileId,
        baseLocalFile: lastWorkbenchDataRef.current?.baseLocalFile ?? null,
        comparisonLocalFile: lastWorkbenchDataRef.current?.comparisonLocalFile ?? null,
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
    updateWorkbenchData,
  ]);

  const handleExecuteCompare = useCallback(async () => {
    const selected: StirlingFile[] = [];
    const baseSel = params.baseFileId ? selectors.getFile(params.baseFileId) : null;
    const compSel = params.comparisonFileId ? selectors.getFile(params.comparisonFileId) : null;
    if (baseSel) selected.push(baseSel);
    if (compSel) selected.push(compSel);

    const baseId = params.baseFileId as FileId | null;
    const compId = params.comparisonFileId as FileId | null;
    prepareWorkbenchForRun(baseId, compId);
    if (baseId && compId) {
      requestAnimationFrame(() => {
        navigationActions.setWorkbench(CUSTOM_WORKBENCH_ID);
      });
    }

    await operation.executeOperation(
      { ...params },
      selected
    );
  }, [navigationActions, operation, params, prepareWorkbenchForRun, selectors]);

  // Run compare with explicit ids (used after swap so we don't depend on async state propagation)
  const runCompareWithIds = useCallback(async (baseId: FileId | null, compId: FileId | null) => {
    const nextParams = { ...params, baseFileId: baseId, comparisonFileId: compId };
    const selected: StirlingFile[] = [];
    const baseSel = baseId ? selectors.getFile(baseId) : null;
    const compSel = compId ? selectors.getFile(compId) : null;
    if (baseSel) selected.push(baseSel);
    if (compSel) selected.push(compSel);
    prepareWorkbenchForRun(baseId, compId);
    await operation.executeOperation(nextParams, selected);
  }, [operation, params, prepareWorkbenchForRun, selectors]);

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

      if (!stub) {
        return (
          <Stack gap={6}>
            <Text fw={700} size="sm">
              {role === 'base' ? t('compare.original.label', 'Original PDF') : t('compare.edited.label', 'Edited PDF')}
            </Text>
            <Box
              style={{
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                padding: '0.75rem 1rem',
                background: 'var(--bg-surface)',
                width: '100%',
              }}
            >
              <Text size="sm" c="dimmed">
                {t(
                  role === 'base' ? 'compare.original.placeholder' : 'compare.edited.placeholder',
                  role === 'base' ? 'Select the original PDF' : 'Select the edited PDF'
                )}
              </Text>
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
          <Text fw={700} size="sm">
            {role === 'base' ? t('compare.original.label', 'Original PDF') : t('compare.edited.label', 'Edited PDF')}
          </Text>
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
    [params.baseFileId, params.comparisonFileId, selectors, t]
  );

  const canExecute = Boolean(
    params.baseFileId && params.comparisonFileId && params.baseFileId !== params.comparisonFileId && !base.operation.isLoading && base.endpointEnabled !== false
  );

  const hasBothSelected = Boolean(params.baseFileId && params.comparisonFileId);

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
            <Box
              style={{
                gridColumn: '1',
                minWidth: 0,
                
              }}
            >
              {renderSelectedFile('base')}
              <div style={{ height: '0.75rem' }} />
              {renderSelectedFile('comparison')}
            </Box>
            {hasBothSelected && (
            <Box
              style={{
                gridColumn: '2',
                gridRow: '1',
                display: 'flex',
                alignItems: 'stretch',
                justifyContent: 'center',
                alignSelf: 'stretch',
                marginTop: '1.5rem',
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
                <SwapVertRoundedIcon fontSize="medium" />
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
