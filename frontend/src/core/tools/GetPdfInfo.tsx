import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import LocalIcon from '@app/components/shared/LocalIcon';
import { Stack, Group, Divider, Text, UnstyledButton } from '@mantine/core';
import { createToolFlow } from '@app/components/tools/shared/createToolFlow';
import { useBaseTool } from '@app/hooks/tools/shared/useBaseTool';
import { BaseToolProps, ToolComponent } from '@app/types/tool';
import { useGetPdfInfoParameters, defaultParameters } from '@app/hooks/tools/getPdfInfo/useGetPdfInfoParameters';
import GetPdfInfoResults from '@app/components/tools/getPdfInfo/GetPdfInfoResults';
import { useGetPdfInfoOperation, GetPdfInfoOperationHook } from '@app/hooks/tools/getPdfInfo/useGetPdfInfoOperation';
import GetPdfInfoReportView from '@app/components/tools/getPdfInfo/GetPdfInfoReportView';
import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';
import { useNavigationActions, useNavigationState } from '@app/contexts/NavigationContext';
import type { PdfInfoReportData } from '@app/types/getPdfInfo';

const CHAPTERS = [
  { id: 'summary', labelKey: 'getPdfInfo.summary.title', fallback: 'PDF Summary' },
  { id: 'metadata', labelKey: 'getPdfInfo.sections.metadata', fallback: 'Metadata' },
  { id: 'formFields', labelKey: 'getPdfInfo.sections.formFields', fallback: 'Form Fields' },
  { id: 'basicInfo', labelKey: 'getPdfInfo.sections.basicInfo', fallback: 'Basic Info' },
  { id: 'documentInfo', labelKey: 'getPdfInfo.sections.documentInfo', fallback: 'Document Info' },
  { id: 'compliance', labelKey: 'getPdfInfo.sections.compliance', fallback: 'Compliance' },
  { id: 'encryption', labelKey: 'getPdfInfo.sections.encryption', fallback: 'Encryption' },
  { id: 'permissions', labelKey: 'getPdfInfo.sections.permissions', fallback: 'Permissions' },
  { id: 'toc', labelKey: 'getPdfInfo.sections.tableOfContents', fallback: 'Table of Contents' },
  { id: 'other', labelKey: 'getPdfInfo.sections.other', fallback: 'Other' },
  { id: 'perPage', labelKey: 'getPdfInfo.sections.perPageInfo', fallback: 'Per Page Info' },
];

const GetPdfInfo = (props: BaseToolProps) => {
  const { t } = useTranslation();
  const { actions: navigationActions } = useNavigationActions();
  const navigationState = useNavigationState();
  const {
    registerCustomWorkbenchView,
    unregisterCustomWorkbenchView,
    setCustomWorkbenchViewData,
    clearCustomWorkbenchViewData,
  } = useToolWorkflow();

  const REPORT_VIEW_ID = 'getPdfInfoReport';
  const REPORT_WORKBENCH_ID = 'custom:getPdfInfoReport' as const;
  const reportIcon = useMemo(() => <LocalIcon icon="picture-as-pdf-rounded" width={20} height={20} />, []);

  const base = useBaseTool(
    'getPdfInfo',
    useGetPdfInfoParameters,
    useGetPdfInfoOperation,
    props
  );

  const operation = base.operation as GetPdfInfoOperationHook;
  const hasResults = operation.results.length > 0;
  const showResultsStep = hasResults || base.operation.isLoading || !!base.operation.errorMessage;

  useEffect(() => {
    registerCustomWorkbenchView({
      id: REPORT_VIEW_ID,
      workbenchId: REPORT_WORKBENCH_ID,
      label: t('getPdfInfo.report.shortTitle', 'PDF Information'),
      icon: reportIcon,
      component: GetPdfInfoReportView,
    });

    return () => {
      clearCustomWorkbenchViewData(REPORT_VIEW_ID);
      unregisterCustomWorkbenchView(REPORT_VIEW_ID);
    };
  }, [
    clearCustomWorkbenchViewData,
    registerCustomWorkbenchView,
    reportIcon,
    t,
    unregisterCustomWorkbenchView,
  ]);

  const reportData = useMemo<PdfInfoReportData | null>(() => {
    if (operation.results.length === 0) return null;
    const generatedAt = operation.results[0].summaryGeneratedAt ?? Date.now();
    return {
      generatedAt,
      entries: operation.results,
    };
  }, [operation.results]);

  const lastReportGeneratedAtRef = useRef<number | null>(null);
  useEffect(() => {
    if (reportData) {
      setCustomWorkbenchViewData(REPORT_VIEW_ID, reportData);
      const generatedAt = reportData.generatedAt ?? null;
      const isNewReport = generatedAt && generatedAt !== lastReportGeneratedAtRef.current;
      if (isNewReport) {
        lastReportGeneratedAtRef.current = generatedAt;
        if (navigationState.selectedTool === 'getPdfInfo' && navigationState.workbench !== REPORT_WORKBENCH_ID) {
          navigationActions.setWorkbench(REPORT_WORKBENCH_ID);
        }
      }
    } else {
      clearCustomWorkbenchViewData(REPORT_VIEW_ID);
      lastReportGeneratedAtRef.current = null;
    }
  }, [
    clearCustomWorkbenchViewData,
    navigationActions,
    navigationState.selectedTool,
    navigationState.workbench,
    reportData,
    setCustomWorkbenchViewData,
  ]);

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: hasResults,
    },
    steps: [
      {
        title: t('getPdfInfo.indexTitle', 'Index'),
        isVisible: Boolean(reportData),
        isCollapsed: false,
        content: (
          <Stack gap={0}>
            {CHAPTERS.map((c, idx) => (
              <Stack key={c.id} gap={0}>
                <UnstyledButton
                  onClick={() => {
                    if (!reportData) return;
                    setCustomWorkbenchViewData(REPORT_VIEW_ID, { ...reportData, scrollTo: c.id });
                    if (navigationState.workbench !== REPORT_WORKBENCH_ID) {
                      navigationActions.setWorkbench(REPORT_WORKBENCH_ID);
                    }
                  }}
                  style={{ width: '100%', textAlign: 'left', padding: '8px 4px' }}
                >
                  <Group justify="flex-start" gap="sm">
                    <LocalIcon icon="link-rounded" width={20} height={20} style={{ opacity: 0.7 }} />
                    <Text size="md" c="dimmed">
                      {t(c.labelKey, c.fallback)}
                    </Text>
                  </Group>
                </UnstyledButton>
                {idx < CHAPTERS.length - 1 && <Divider my={6} />}
              </Stack>
            ))}
          </Stack>
        ),
      },
      {
        title: t('getPdfInfo.results', 'Results'),
        isVisible: showResultsStep,
        isCollapsed: false,
        content: (
          <GetPdfInfoResults
            operation={operation}
            isLoading={base.operation.isLoading}
            errorMessage={base.operation.errorMessage}
          />
        ),
      },
    ],
    executeButton: {
      text: t('getPdfInfo.submit', 'Generate'),
      loadingText: t('loading', 'Loading...'),
      onClick: base.handleExecute,
      disabled:
        !base.params.validateParameters() ||
        !base.hasFiles ||
        base.operation.isLoading ||
        !base.endpointEnabled,
      isVisible: true,
    },
    review: {
      isVisible: false,
      operation: base.operation,
      title: t('getPdfInfo.results', 'Results'),
      onUndo: base.handleUndo,
    },
  });
};

const GetPdfInfoTool = GetPdfInfo as ToolComponent;
GetPdfInfoTool.tool = () => useGetPdfInfoOperation;
GetPdfInfoTool.getDefaultParameters = () => ({ ...defaultParameters });

export default GetPdfInfoTool;


