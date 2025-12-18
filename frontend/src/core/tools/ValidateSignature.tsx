import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import LocalIcon from '@app/components/shared/LocalIcon';
import { createToolFlow } from '@app/components/tools/shared/createToolFlow';
import { useBaseTool } from '@app/hooks/tools/shared/useBaseTool';
import { BaseToolProps, ToolComponent } from '@app/types/tool';
import { useValidateSignatureParameters, defaultParameters } from '@app/hooks/tools/validateSignature/useValidateSignatureParameters';
import ValidateSignatureSettings from '@app/components/tools/validateSignature/ValidateSignatureSettings';
import ValidateSignatureResults from '@app/components/tools/validateSignature/ValidateSignatureResults';
import { useValidateSignatureOperation, ValidateSignatureOperationHook } from '@app/hooks/tools/validateSignature/useValidateSignatureOperation';
import ValidateSignatureReportView from '@app/components/tools/validateSignature/ValidateSignatureReportView';
import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';
import { useNavigationActions, useNavigationState } from '@app/contexts/NavigationContext';
import type { SignatureValidationReportData } from '@app/types/validateSignature';

const ValidateSignature = (props: BaseToolProps) => {
  const { t } = useTranslation();
  const { actions: navigationActions } = useNavigationActions();
  const navigationState = useNavigationState();
  const {
    registerCustomWorkbenchView,
    unregisterCustomWorkbenchView,
    setCustomWorkbenchViewData,
    clearCustomWorkbenchViewData,
  } = useToolWorkflow();

  const REPORT_VIEW_ID = 'validateSignatureReport';
  const REPORT_WORKBENCH_ID = 'custom:validateSignatureReport' as const;
  const reportIcon = useMemo(() => <LocalIcon icon="picture-as-pdf-rounded" width={20} height={20} />, []);

  const base = useBaseTool(
    'validateSignature',
    useValidateSignatureParameters,
    useValidateSignatureOperation,
    props
  );

  const operation = base.operation as ValidateSignatureOperationHook;
  const hasResults = operation.results.length > 0;
  const showResultsStep = hasResults || base.operation.isLoading || !!base.operation.errorMessage;



  useEffect(() => {
    registerCustomWorkbenchView({
      id: REPORT_VIEW_ID,
      workbenchId: REPORT_WORKBENCH_ID,
      label: t('validateSignature.report.shortTitle', 'Signature Report'),
      icon: reportIcon,
      component: ValidateSignatureReportView,
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

  const reportData = useMemo<SignatureValidationReportData | null>(() => {
    if (operation.results.length === 0) {
      return null;
    }

    const generatedAt = operation.results[0].summaryGeneratedAt ?? Date.now();

    return {
      generatedAt,
      entries: operation.results,
    };
  }, [operation.results]);

  // Track last time we auto-navigated to the report so we don't override
  // the user's manual tab change. Only navigate when a new report is generated.
  const lastReportGeneratedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (reportData) {
      setCustomWorkbenchViewData(REPORT_VIEW_ID, reportData);

      const generatedAt = reportData.generatedAt ?? null;
      const isNewReport = generatedAt && generatedAt !== lastReportGeneratedAtRef.current;

      if (isNewReport) {
        lastReportGeneratedAtRef.current = generatedAt;
        if (navigationState.selectedTool === 'validateSignature' && navigationState.workbench !== REPORT_WORKBENCH_ID) {
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
        title: t('validateSignature.settings.title', 'Validation Settings'),
        isCollapsed: base.settingsCollapsed,
        onCollapsedClick: base.settingsCollapsed ? base.handleSettingsReset : undefined,
        content: (
          <ValidateSignatureSettings
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.operation.isLoading || base.endpointLoading}
          />
        ),
      },
      {
        title: t('validateSignature.results', 'Validation Results'),
        isVisible: showResultsStep,
        isCollapsed: false,
        content: (
          <ValidateSignatureResults
            operation={operation}
            results={operation.results}
            isLoading={base.operation.isLoading}
            errorMessage={base.operation.errorMessage}
            reportAvailable={Boolean(reportData)}
          />
        ),
      },
    ],
    executeButton: {
      text: t('validateSignature.submit', 'Validate Signatures'),
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
      title: t('validateSignature.results', 'Validation Results'),
      onUndo: base.handleUndo,
    },
  });
};

const ValidateSignatureTool = ValidateSignature as ToolComponent;
ValidateSignatureTool.tool = () => useValidateSignatureOperation;
ValidateSignatureTool.getDefaultParameters = () => ({ ...defaultParameters });

export default ValidateSignatureTool;
