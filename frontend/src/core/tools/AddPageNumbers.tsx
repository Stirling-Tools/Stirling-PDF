import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useFileSelection } from "@app/contexts/FileContext";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import { BaseToolProps, ToolComponent } from "@app/types/tool";
import { useEndpointEnabled } from "@app/hooks/useEndpointConfig";
import { useAddPageNumbersParameters } from "@app/components/tools/addPageNumbers/useAddPageNumbersParameters";
import { useAddPageNumbersOperation } from "@app/components/tools/addPageNumbers/useAddPageNumbersOperation";
import { useAccordionSteps } from "@app/hooks/tools/shared/useAccordionSteps";
import AddPageNumbersPositionSettings from "@app/components/tools/addPageNumbers/AddPageNumbersPositionSettings";
import AddPageNumbersAppearanceSettings from "@app/components/tools/addPageNumbers/AddPageNumbersAppearanceSettings";
import { useAddPageNumbersTips } from "@app/components/tooltips/useAddPageNumbersTips";

const AddPageNumbers = ({ onPreviewFile, onComplete, onError }: BaseToolProps) => {
  const { t } = useTranslation();
  const { selectedFiles } = useFileSelection();

  const params = useAddPageNumbersParameters();
  const operation = useAddPageNumbersOperation();
  const pageNumbersTips = useAddPageNumbersTips();

  const { enabled: endpointEnabled, loading: endpointLoading } = useEndpointEnabled("add-page-numbers");

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
      onError?.(error?.message || t("addPageNumbers.error.failed", "Add page numbers operation failed"));
    }
  };

  const hasFiles = selectedFiles.length > 0;
  const hasResults = operation.files.length > 0 || operation.downloadUrl !== null;

  enum AddPageNumbersStep {
    NONE = 'none',
    POSITION_AND_PAGES = 'position_and_pages',
    CUSTOMIZE = 'customize'
  }

  const accordion = useAccordionSteps<AddPageNumbersStep>({
    noneValue: AddPageNumbersStep.NONE,
    initialStep: AddPageNumbersStep.POSITION_AND_PAGES,
    stateConditions: {
      hasFiles,
      hasResults
    },
    afterResults: () => {
      operation.resetResults();
      onPreviewFile?.(null);
    }
  });

  const getSteps = () => {
    const steps: any[] = [];

    // Step 1: Position Selection & Pages/Starting Number
    steps.push({
      title: t("addPageNumbers.positionAndPages", "Position & Pages"),
      isCollapsed: accordion.getCollapsedState(AddPageNumbersStep.POSITION_AND_PAGES),
      onCollapsedClick: () => accordion.handleStepToggle(AddPageNumbersStep.POSITION_AND_PAGES),
      isVisible: hasFiles || hasResults,
      tooltip: pageNumbersTips,
      content: (
        <AddPageNumbersPositionSettings
          parameters={params.parameters}
          onParameterChange={params.updateParameter}
          disabled={endpointLoading}
          file={selectedFiles[0] || null}
          showQuickGrid={true}
        />
      ),
    });

    // Step 2: Customize Appearance
    steps.push({
      title: t("addPageNumbers.customize", "Customize Appearance"),
      isCollapsed: accordion.getCollapsedState(AddPageNumbersStep.CUSTOMIZE),
      onCollapsedClick: () => accordion.handleStepToggle(AddPageNumbersStep.CUSTOMIZE),
      isVisible: hasFiles || hasResults,
      content: (
        <AddPageNumbersAppearanceSettings
          parameters={params.parameters}
          onParameterChange={params.updateParameter}
          disabled={endpointLoading}
        />
      ),
    });

    return steps;
  };

  return createToolFlow({
    files: {
      selectedFiles,
      isCollapsed: hasResults,
    },
    steps: getSteps(),
    executeButton: {
      text: t('addPageNumbers.submit', 'Add Page Numbers'),
      isVisible: !hasResults,
      loadingText: t('loading'),
      onClick: handleExecute,
      disabled: !params.validateParameters() || !hasFiles || !endpointEnabled,
    },
    review: {
      isVisible: hasResults,
      operation: operation,
      title: t('addPageNumbers.results.title', 'Page Number Results'),
      onFileClick: (file) => onPreviewFile?.(file),
      onUndo: async () => {
        await operation.undoOperation();
        onPreviewFile?.(null);
      },
    },
  });
};

AddPageNumbers.tool = () => useAddPageNumbersOperation;

export default AddPageNumbers as ToolComponent;