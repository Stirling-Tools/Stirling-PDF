import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import CompareRoundedIcon from '@mui/icons-material/CompareRounded';
import { Box, Card, Group, Stack, Text, Button } from '@mantine/core';
import { useBaseTool } from '../hooks/tools/shared/useBaseTool';
import { BaseToolProps, ToolComponent } from '../types/tool';
import {
  useCompareParameters,
  defaultParameters as compareDefaultParameters,
} from '../hooks/tools/compare/useCompareParameters';
import {
  useCompareOperation,
  CompareOperationHook,
} from '../hooks/tools/compare/useCompareOperation';
import CompareWorkbenchView from '../components/tools/compare/CompareWorkbenchView';
import { useToolWorkflow } from '../contexts/ToolWorkflowContext';
import { useNavigationActions, useNavigationState } from '../contexts/NavigationContext';
import { useFileActions, useFileContext } from '../contexts/file/fileHooks';
import type { FileId } from '../types/file';
import { createToolFlow } from '../components/tools/shared/createToolFlow';
import DocumentThumbnail from '../components/shared/filePreview/DocumentThumbnail';
import { useFilesModalContext } from '../contexts/FilesModalContext';

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
  const { actions: fileActions } = useFileActions();
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

  const compareIcon = useMemo(() => <CompareRoundedIcon fontSize="small" />, []);

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
      clearCustomWorkbenchViewData(CUSTOM_VIEW_ID);
      unregisterCustomWorkbenchView(CUSTOM_VIEW_ID);
    };
  // Register once; avoid re-registering on translation/prop changes which clears data mid-flight
  }, []);

  // Map the first two selected workbench files into base/comparison in order
  useEffect(() => {
    const first = base.selectedFiles[0]?.fileId as FileId | undefined;
    const second = base.selectedFiles[1]?.fileId as FileId | undefined;

    const nextBase: FileId | null = first ?? null;
    const nextComp: FileId | null = second ?? null;

    // Removed verbose diagnostics

    if (params.baseFileId !== nextBase || params.comparisonFileId !== nextComp) {
      base.params.setParameters((prev: any) => ({
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
      
      setCustomWorkbenchViewData(CUSTOM_VIEW_ID, {
        result,
        baseFileId,
        comparisonFileId,
        baseLocalFile: null,
        comparisonLocalFile: null,
      });
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

  const handleOpenWorkbench = useCallback(() => {
    navigationActions.setWorkbench(CUSTOM_WORKBENCH_ID);
  }, [navigationActions]);

  const handleExecuteCompare = useCallback(async () => {
    const selected: any[] = [];
    const baseSel = params.baseFileId ? selectors.getFile(params.baseFileId) : null;
    const compSel = params.comparisonFileId ? selectors.getFile(params.comparisonFileId) : null;
    if (baseSel) selected.push(baseSel);
    if (compSel) selected.push(compSel);
    await operation.executeOperation(
      { ...params } as any,
      selected as any
    );
  }, [operation, params, selectors]);

  const renderSelectedFile = useCallback(
    (role: 'base' | 'comparison') => {
      const fileId = role === 'base' ? params.baseFileId : params.comparisonFileId;
      const stub = fileId ? selectors.getStirlingFileStub(fileId) : undefined;

      if (!stub) {
        return (
          <Card withBorder padding="md" radius="md">
            <Text size="sm" c="dimmed">
              {t(role === 'base' ? 'compare.base.placeholder' : 'compare.comparison.placeholder', role === 'base' ? 'Select a base PDF' : 'Select a comparison PDF')}
            </Text>
          </Card>
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
        <Card withBorder padding="md" radius="md">
          <Group align="flex-start" wrap="nowrap" gap="md">
            <Box style={{ width: 64, height: 84, flexShrink: 0 }}>
              <DocumentThumbnail file={stub as any} thumbnail={stub?.thumbnailUrl || null} />
            </Box>
            <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
              <Text fw={600} truncate>
                {stub?.name}
              </Text>
              {meta && (
                <Text size="sm" c="dimmed">
                  {meta}
                </Text>
              )}
              <Button
                variant="light"
                size="xs"
                onClick={() => {
                  openFilesModal({
                    maxNumberOfFiles: 1,
                    customHandler: async (files: File[]) => {
                      if (!files.length) return;
                      try {
                        const added = await fileActions.addFiles(files, { selectFiles: true });
                        const primary = added[0];
                        if (!primary) return;
                        base.params.setParameters((prev: any) => ({
                          ...prev,
                          baseFileId: role === 'base' ? (primary.fileId as FileId) : prev.baseFileId,
                          comparisonFileId: role === 'comparison' ? (primary.fileId as FileId) : prev.comparisonFileId,
                        }));
                      } catch (e) {
                        console.error('[compare] replace file failed', e);
                      }
                    },
                  });
                }}
                disabled={base.operation.isLoading}
              >
                {t('compare.upload.replaceFile', 'Replace file')}
              </Button>
            </Stack>
          </Group>
        </Card>
      );
    },
    [params.baseFileId, params.comparisonFileId, selectors, t]
  );

  const canExecute = Boolean(
    params.baseFileId && params.comparisonFileId && params.baseFileId !== params.comparisonFileId && !base.operation.isLoading && base.endpointEnabled !== false
  );

  return createToolFlow({
    title: {
      title: t('compare.title', 'Compare Documents'),
      description: t('compare.description', 'Select the base and comparison PDF to highlight differences.'),
    },
    files: {
      selectedFiles: base.selectedFiles,
    },
    steps: [
      {
        title: t('compare.base.label', 'Base Document'),
        isVisible: true,
        content: renderSelectedFile('base'),
      },
      {
        title: t('compare.comparison.label', 'Comparison Document'),
        isVisible: true,
        content: renderSelectedFile('comparison'),
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
