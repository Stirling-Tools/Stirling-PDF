import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useFileSelection } from "@app/contexts/FileContext";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import { BaseToolProps, ToolComponent } from "@app/types/tool";
import { useEndpointEnabled } from "@app/hooks/useEndpointConfig";
import { useAddAttachmentsParameters } from "@app/hooks/tools/addAttachments/useAddAttachmentsParameters";
import { useAddAttachmentsOperation } from "@app/hooks/tools/addAttachments/useAddAttachmentsOperation";
import { useAccordionSteps } from "@app/hooks/tools/shared/useAccordionSteps";
import AddAttachmentsSettings from "@app/components/tools/addAttachments/AddAttachmentsSettings";
import { useAddAttachmentsTips } from "@app/components/tooltips/useAddAttachmentsTips";

const AddAttachments = ({ onPreviewFile, onComplete, onError }: BaseToolProps) => {
  const { t } = useTranslation();
  const { selectedFiles } = useFileSelection();
  const addAttachmentsTips = useAddAttachmentsTips();

  const params = useAddAttachmentsParameters();
  const operation = useAddAttachmentsOperation();

  const { enabled: endpointEnabled, loading: endpointLoading } = useEndpointEnabled("add-attachments");

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
      onError?.(error?.message || t("AddAttachmentsRequest.error.failed", "Add attachments operation failed"));
    }
  };

  const hasFiles = selectedFiles.length > 0;
  const hasResults = operation.files.length > 0 || operation.downloadUrl !== null;

  enum AddAttachmentsStep {
    NONE = 'none',
    ATTACHMENTS = 'attachments'
  }

  const accordion = useAccordionSteps<AddAttachmentsStep>({
    noneValue: AddAttachmentsStep.NONE,
    initialStep: AddAttachmentsStep.ATTACHMENTS,
    stateConditions: {
      hasFiles,
      hasResults: false // Don't collapse when there are results for add attachments
    },
    afterResults: () => {
      operation.resetResults();
      onPreviewFile?.(null);
    }
  });

  const getSteps = () => {
    const steps: any[] = [];

    // Step 1: Attachments Selection
    steps.push({
      title: t("AddAttachmentsRequest.attachments", "Select Attachments"),
      isCollapsed: accordion.getCollapsedState(AddAttachmentsStep.ATTACHMENTS),
      onCollapsedClick: () => accordion.handleStepToggle(AddAttachmentsStep.ATTACHMENTS),
      isVisible: true,
      tooltip: addAttachmentsTips,
      content: (
        <AddAttachmentsSettings
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
      text: t('AddAttachmentsRequest.submit', 'Add Attachments'),
      isVisible: !hasResults,
      loadingText: t('loading'),
      onClick: handleExecute,
      disabled: !params.validateParameters() || !hasFiles || !endpointEnabled,
    },
    review: {
      isVisible: hasResults,
      operation: operation,
      title: t('AddAttachmentsRequest.results.title', 'Attachment Results'),
      onFileClick: (file) => onPreviewFile?.(file),
      onUndo: async () => {
        await operation.undoOperation();
        onPreviewFile?.(null);
      },
    },
  });
};

AddAttachments.tool = () => useAddAttachmentsOperation;

export default AddAttachments as ToolComponent;
