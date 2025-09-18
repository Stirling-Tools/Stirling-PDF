import { useState } from "react";
import { useTranslation } from "react-i18next";
import { createToolFlow } from "../components/tools/shared/createToolFlow";
import DeleteAllStep from "../components/tools/changeMetadata/steps/DeleteAllStep";
import StandardMetadataStep from "../components/tools/changeMetadata/steps/StandardMetadataStep";
import DocumentDatesStep from "../components/tools/changeMetadata/steps/DocumentDatesStep";
import AdvancedOptionsStep from "../components/tools/changeMetadata/steps/AdvancedOptionsStep";
import { useChangeMetadataParameters } from "../hooks/tools/changeMetadata/useChangeMetadataParameters";
import { useChangeMetadataOperation } from "../hooks/tools/changeMetadata/useChangeMetadataOperation";
import { useMetadataExtraction } from "../hooks/tools/changeMetadata/useMetadataExtraction";
import { useBaseTool } from "../hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "../types/tool";
import {
  useDeleteAllTips,
  useStandardMetadataTips,
  useDocumentDatesTips,
  useAdvancedOptionsTips
} from "../components/tooltips/useChangeMetadataTips";

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

  // Individual step collapse states - only one can be open at a time
  const [openStep, setOpenStep] = useState<MetadataStep>(MetadataStep.DELETE_ALL);

  const base = useBaseTool(
    'changeMetadata',
    useChangeMetadataParameters,
    useChangeMetadataOperation,
    props,
  );

  // Extract metadata from uploaded files
  const { isExtractingMetadata } = useMetadataExtraction(base.params);

  // Compute actual collapsed state based on results and accordion behavior
  const getActualCollapsedState = (stepName: MetadataStep) => {
    return (!base.hasFiles || base.hasResults) ? true : openStep !== stepName;
  };

  // Handle step toggle for accordion behavior
  const handleStepToggle = (stepName: MetadataStep) => {
    if (base.hasResults) {
      if (base.settingsCollapsed) {
        base.handleSettingsReset();
      }
      return;
    }
    setOpenStep(openStep === stepName ? MetadataStep.NONE : stepName);
  };

  // Create step objects
  const createStandardMetadataStep = () => ({
    title: t("changeMetadata.standardFields.title", "Standard Fields"),
    isCollapsed: getActualCollapsedState(MetadataStep.STANDARD_METADATA),
    onCollapsedClick: () => handleStepToggle(MetadataStep.STANDARD_METADATA),
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
    isCollapsed: getActualCollapsedState(MetadataStep.DOCUMENT_DATES),
    onCollapsedClick: () => handleStepToggle(MetadataStep.DOCUMENT_DATES),
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
    isCollapsed: getActualCollapsedState(MetadataStep.ADVANCED_OPTIONS),
    onCollapsedClick: () => handleStepToggle(MetadataStep.ADVANCED_OPTIONS),
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
        isCollapsed: getActualCollapsedState(MetadataStep.DELETE_ALL),
        onCollapsedClick: () => handleStepToggle(MetadataStep.DELETE_ALL),
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
