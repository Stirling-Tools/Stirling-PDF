import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import CompareRoundedIcon from '@mui/icons-material/CompareRounded';
import { Box, Group, Stack, Text, Button } from '@mantine/core';
import { Tooltip } from '@app/components/shared/Tooltip';
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
import CompareWorkbenchView from '../../components/tools/compare/CompareWorkbenchView';
import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';
import { useNavigationActions, useNavigationState } from '@app/contexts/NavigationContext';
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
  const navigationState = useNavigationState();
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
      clearCustomWorkbenchViewData(CUSTOM_VIEW_ID);
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

  // Only switch to custom view once per result (prevents update loops)
  const lastProcessedAtRef = useRef<number | null>(null);
  useEffect(() => {
    const { result } = operation;
    const { baseFileId, comparisonFileId } = params;
    const processedAt = result?.totals.processedAt ?? null;
    const hasSelection = Boolean(baseFileId && comparisonFileId);
    const matchesSelection = Boolean(
      result &&
      hasSelection &&
      result.base.fileId === baseFileId &&
      result.comparison.fileId === comparisonFileId
    );
    

    if (matchesSelection && result && processedAt !== null && processedAt !== lastProcessedAtRef.current) {
      
      const workbenchData: CompareWorkbenchData = {
        result,
        baseFileId,
        comparisonFileId,
        baseLocalFile: null,
        comparisonLocalFile: null,
      };
      setCustomWorkbenchViewData(CUSTOM_VIEW_ID, workbenchData);
      // Defer workbench switch to the next frame so the data update is visible to the provider
      requestAnimationFrame(() => {
          
        
        navigationActions.setWorkbench(CUSTOM_WORKBENCH_ID);
      });
      lastProcessedAtRef.current = processedAt;
    }

    if (!result) {
      lastProcessedAtRef.current = null;
      clearCustomWorkbenchViewData(CUSTOM_VIEW_ID);
    }
  }, [
    clearCustomWorkbenchViewData,
    navigationActions,
    navigationState.selectedTool,
    operation.result,
    params.baseFileId,
    params.comparisonFileId,
    setCustomWorkbenchViewData,
    params,
  ]);

  const handleExecuteCompare = useCallback(async () => {
    const selected: StirlingFile[] = [];
    const baseSel = params.baseFileId ? selectors.getFile(params.baseFileId) : null;
    const compSel = params.comparisonFileId ? selectors.getFile(params.comparisonFileId) : null;
    if (baseSel) selected.push(baseSel);
    if (compSel) selected.push(compSel);
    await operation.executeOperation(
      { ...params },
      selected
    );
  }, [operation, params, selectors]);

  // Run compare with explicit ids (used after swap so we don't depend on async state propagation)
  const runCompareWithIds = useCallback(async (baseId: FileId | null, compId: FileId | null) => {
    const nextParams = { ...params, baseFileId: baseId, comparisonFileId: compId };
    const selected: StirlingFile[] = [];
    const baseSel = baseId ? selectors.getFile(baseId) : null;
    const compSel = compId ? selectors.getFile(compId) : null;
    if (baseSel) selected.push(baseSel);
    if (compSel) selected.push(compSel);
    await operation.executeOperation(nextParams, selected);
  }, [operation, params, selectors]);

  const handleSwap = useCallback(() => {
    const baseId = params.baseFileId as FileId | null;
    const compId = params.comparisonFileId as FileId | null;
    if (!baseId || !compId) return;
    base.params.setParameters((prev) => ({
      ...prev,
      baseFileId: compId,
      comparisonFileId: baseId,
    }));
    // If we already have a comparison result, re-run automatically using the swapped ids.
    if (operation.result) {
      runCompareWithIds(compId, baseId);
    }
  }, [base.params, params.baseFileId, params.comparisonFileId, operation.result, runCompareWithIds]);

  const renderSelectedFile = useCallback(
    (role: 'base' | 'comparison') => {
      const fileId = role === 'base' ? params.baseFileId : params.comparisonFileId;
      const stub = fileId ? selectors.getStirlingFileStub(fileId) : undefined;

      if (!stub) {
        return (
          <Box
            style={{
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              padding: '0.75rem 1rem',
              background: 'var(--bg-surface)'
            }}
          >
            <Text size="sm" c="dimmed">
              {t(
                role === 'base' ? 'compare.base.placeholder' : 'compare.comparison.placeholder',
                role === 'base' ? 'Select a base PDF' : 'Select a comparison PDF'
              )}
            </Text>
          </Box>
        );
      }

      const dateMs = (stub?.lastModified || stub?.createdAt) ?? null;
      const dateText = dateMs
        ? new Date(dateMs).toLocaleDateString(undefined, { month: 'short', day: '2-digit', year: 'numeric' })
        : '';
      const pageCount = stub?.processedFile?.totalPages || null;
      const meta = [dateText, pageCount ? `${pageCount} ${t('compare.pages', 'Pages')}` : null]
        .filter(Boolean)
        .join(' - ');

      return (
        <Box
          style={{
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            padding: '0.75rem 1rem',
            background: 'var(--bg-surface)'
          }}
        >
          <Group align="flex-start" wrap="nowrap" gap="md">
            <Box className="compare-tool__thumbnail">
              <DocumentThumbnail file={stub ?? null} thumbnail={stub?.thumbnailUrl || null} />
            </Box>
            <Stack gap={4} className="compare-tool__details">
              <Tooltip content={stub?.name || ''} position="top" arrow>
                <FitText 
                  text={stub?.name || ''} 
                  minimumFontScale={0.5} 
                  lines={2}
                  style={{ fontWeight: 600 }}
                />
              </Tooltip>
              {meta && (
                <Text size="sm" c="dimmed">
                  {meta}
                </Text>
              )}
            </Stack>
          </Group>
        </Box>
      );
    },
    [params.baseFileId, params.comparisonFileId, selectors, t]
  );

  const canExecute = Boolean(
    params.baseFileId && params.comparisonFileId && params.baseFileId !== params.comparisonFileId && !base.operation.isLoading && base.endpointEnabled !== false
  );

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: false,
    },
    steps: [
      {
        title: t('compare.selection.title', 'Select Base and Comparison'),
        isVisible: true,
        content: (
          <Stack gap="md">
            {renderSelectedFile('base')}
            {renderSelectedFile('comparison')}
            <Group justify="flex-start">
              <Button
                variant="outline"
                onClick={handleSwap}
                disabled={!params.baseFileId || !params.comparisonFileId || base.operation.isLoading}
              >
                {t('compare.swap', 'Swap PDFs')}
              </Button>
            </Group>
          </Stack>
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
