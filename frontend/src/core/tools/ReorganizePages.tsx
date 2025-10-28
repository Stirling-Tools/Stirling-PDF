import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import { BaseToolProps, ToolComponent } from "@app/types/tool";
import { useEndpointEnabled } from "@app/hooks/useEndpointConfig";
import { useFileSelection } from "@app/contexts/FileContext";
import { useAccordionSteps } from "@app/hooks/tools/shared/useAccordionSteps";
import ReorganizePagesSettings from "@app/components/tools/reorganizePages/ReorganizePagesSettings";
import { useReorganizePagesParameters } from "@app/hooks/tools/reorganizePages/useReorganizePagesParameters";
import { useReorganizePagesOperation } from "@app/hooks/tools/reorganizePages/useReorganizePagesOperation";

const ReorganizePages = ({ onPreviewFile, onComplete, onError }: BaseToolProps) => {
  const { t } = useTranslation();
  const { selectedFiles } = useFileSelection();

  const params = useReorganizePagesParameters();
  const operation = useReorganizePagesOperation();

  const { enabled: endpointEnabled, loading: endpointLoading } = useEndpointEnabled("rearrange-pages");

  useEffect(() => {
    operation.resetResults();
    onPreviewFile?.(null);
  }, [params.parameters]);

  const handleExecute = async () => {
    try {
      await operation.executeOperation(params.parameters, selectedFiles);
      if (operation.files && onComplete) {
        onComplete(operation.files);
      }
    } catch (error: any) {
      onError?.(error?.message || t("reorganizePages.error.failed", "Failed to reorganize pages"));
    }
  };

  const hasFiles = selectedFiles.length > 0;
  const hasResults = operation.files.length > 0 || operation.downloadUrl !== null;

  enum Step {
    NONE = 'none',
    SETTINGS = 'settings'
  }

  const accordion = useAccordionSteps<Step>({
    noneValue: Step.NONE,
    initialStep: Step.SETTINGS,
    stateConditions: {
      hasFiles,
      hasResults
    },
    afterResults: () => {
      operation.resetResults();
      onPreviewFile?.(null);
    }
  });

  const steps = [
    {
      title: t("reorganizePages.settings.title", "Settings"),
      isCollapsed: accordion.getCollapsedState(Step.SETTINGS),
      onCollapsedClick: () => accordion.handleStepToggle(Step.SETTINGS),
      isVisible: true,
      content: (
        <ReorganizePagesSettings
          parameters={params.parameters}
          onParameterChange={params.updateParameter}
          disabled={endpointLoading}
        />
      ),
    }
  ];

  return createToolFlow({
    files: {
      selectedFiles,
      isCollapsed: hasResults,
    },
    steps,
    executeButton: {
      text: t('reorganizePages.submit', 'Reorganize Pages'),
      isVisible: !hasResults,
      loadingText: t('loading'),
      onClick: handleExecute,
      disabled: !params.validateParameters() || !hasFiles || !endpointEnabled,
    },
    review: {
      isVisible: hasResults,
      operation: operation,
      title: t('reorganizePages.results.title', 'Pages Reorganized'),
      onFileClick: (file) => onPreviewFile?.(file),
      onUndo: async () => {
        await operation.undoOperation();
        onPreviewFile?.(null);
      },
    },
  });
};

(ReorganizePages as any).tool = () => useReorganizePagesOperation;

export default ReorganizePages as ToolComponent;


