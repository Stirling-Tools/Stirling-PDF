import { useTranslation } from "react-i18next";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import { useAccordionSteps } from "@app/hooks/tools/shared/useAccordionSteps";
import DeleteAllStep from "@app/components/tools/changeMetadata/steps/DeleteAllStep";
import StandardMetadataStep from "@app/components/tools/changeMetadata/steps/StandardMetadataStep";
import DocumentDatesStep from "@app/components/tools/changeMetadata/steps/DocumentDatesStep";
import AdvancedOptionsStep from "@app/components/tools/changeMetadata/steps/AdvancedOptionsStep";
import { useChangeMetadataParameters } from "@app/hooks/tools/changeMetadata/useChangeMetadataParameters";
import { useChangeMetadataOperation } from "@app/hooks/tools/changeMetadata/useChangeMetadataOperation";
import { useMetadataExtraction } from "@app/hooks/tools/changeMetadata/useMetadataExtraction";
import { useBaseTool } from "@app/hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "@app/types/tool";
import {
  useDeleteAllTips,
  useStandardMetadataTips,
  useDocumentDatesTips,
  useAdvancedOptionsTips
} from "@app/components/tooltips/useChangeMetadataTips";

enum MetadataStep {
  NONE = 'none',
  DELETE_ALL = 'deleteAll',
  STANDARD_METADATA = 'standardMetadata',
  DOCUMENT_DATES = 'documentDates',
  ADVANCED_OPTIONS = 'advancedOptions'
}

const ChangeMetadata = (props: BaseToolProps) => {
  const { t } = useTranslation();

  // Individual tooltips for each step
  const deleteAllTips = useDeleteAllTips();
  const standardMetadataTips = useStandardMetadataTips();
  const documentDatesTips = useDocumentDatesTips();
  const advancedOptionsTips = useAdvancedOptionsTips();

  const base = useBaseTool(
    'changeMetadata',
    useChangeMetadataParameters,
    useChangeMetadataOperation,
    props,
  );

  // Extract metadata from uploaded files
  const { isExtractingMetadata } = useMetadataExtraction(base.params);

  // Accordion step management
  const accordion = useAccordionSteps<MetadataStep>({
    noneValue: MetadataStep.NONE,
    initialStep: MetadataStep.DELETE_ALL,
    stateConditions: {
      hasFiles: base.hasFiles,
      hasResults: base.hasResults
    },
    afterResults: base.handleSettingsReset,
  });

  // Create step objects
  const createStandardMetadataStep = () => ({
    title: t("changeMetadata.standardFields.title", "Standard Fields"),
    isCollapsed: accordion.getCollapsedState(MetadataStep.STANDARD_METADATA),
    onCollapsedClick: () => accordion.handleStepToggle(MetadataStep.STANDARD_METADATA),
    tooltip: standardMetadataTips,
    content: (
      <StandardMetadataStep
        parameters={base.params.parameters}
        onParameterChange={base.params.updateParameter}
        disabled={base.endpointLoading || isExtractingMetadata}
      />
    ),
  });

  const createDocumentDatesStep = () => ({
    title: t("changeMetadata.dates.title", "Date Fields"),
    isCollapsed: accordion.getCollapsedState(MetadataStep.DOCUMENT_DATES),
    onCollapsedClick: () => accordion.handleStepToggle(MetadataStep.DOCUMENT_DATES),
    tooltip: documentDatesTips,
    content: (
      <DocumentDatesStep
        parameters={base.params.parameters}
        onParameterChange={base.params.updateParameter}
        disabled={base.endpointLoading || isExtractingMetadata}
      />
    ),
  });

  const createAdvancedOptionsStep = () => ({
    title: t("changeMetadata.advanced.title", "Advanced Options"),
    isCollapsed: accordion.getCollapsedState(MetadataStep.ADVANCED_OPTIONS),
    onCollapsedClick: () => accordion.handleStepToggle(MetadataStep.ADVANCED_OPTIONS),
    tooltip: advancedOptionsTips,
    content: (
      <AdvancedOptionsStep
        parameters={base.params.parameters}
        onParameterChange={base.params.updateParameter}
        disabled={base.endpointLoading || isExtractingMetadata}
        addCustomMetadata={base.params.addCustomMetadata}
        removeCustomMetadata={base.params.removeCustomMetadata}
        updateCustomMetadata={base.params.updateCustomMetadata}
      />
    ),
  });

  // Build steps array based on deleteAll state
  const buildSteps = () => {
    const steps = [
      {
        title: t("changeMetadata.deleteAll.label", "Remove Existing Metadata"),
        isCollapsed: accordion.getCollapsedState(MetadataStep.DELETE_ALL),
        onCollapsedClick: () => accordion.handleStepToggle(MetadataStep.DELETE_ALL),
        tooltip: deleteAllTips,
        content: (
          <DeleteAllStep
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading || isExtractingMetadata}
          />
        ),
      },
    ];

    if (!base.params.parameters.deleteAll) {
      steps.push(
        createStandardMetadataStep(),
        createDocumentDatesStep(),
        createAdvancedOptionsStep()
      );
    }

    return steps;
  };

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
    },
    steps: buildSteps(),
    executeButton: {
      text: t("changeMetadata.submit", "Update Metadata"),
      isVisible: !base.hasResults,
      loadingText: t("loading"),
      onClick: base.handleExecute,
      disabled: !base.params.validateParameters() || !base.hasFiles || !base.endpointEnabled,
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t("changeMetadata.results.title", "Updated PDFs"),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

export default ChangeMetadata as ToolComponent;
