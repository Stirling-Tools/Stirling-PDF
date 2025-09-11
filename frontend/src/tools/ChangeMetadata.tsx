import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { createToolFlow } from "../components/tools/shared/createToolFlow";
import DeleteAllStep from "../components/tools/changeMetadata/steps/DeleteAllStep";
import StandardMetadataStep from "../components/tools/changeMetadata/steps/StandardMetadataStep";
import DocumentDatesStep from "../components/tools/changeMetadata/steps/DocumentDatesStep";
import CustomMetadataStep from "../components/tools/changeMetadata/steps/CustomMetadataStep";
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
  useCustomMetadataTips,
  useAdvancedOptionsTips
} from "../components/tooltips/useChangeMetadataTips";

const ChangeMetadata = (props: BaseToolProps) => {
  const { t } = useTranslation();
  
  // Individual tooltips for each step
  const deleteAllTips = useDeleteAllTips();
  const standardMetadataTips = useStandardMetadataTips();
  const documentDatesTips = useDocumentDatesTips();
  const customMetadataTips = useCustomMetadataTips();
  const advancedOptionsTips = useAdvancedOptionsTips();

  // Individual step collapse states
  const [deleteAllCollapsed, setDeleteAllCollapsed] = useState(false);
  const [standardMetadataCollapsed, setStandardMetadataCollapsed] = useState(false);
  const [documentDatesCollapsed, setDocumentDatesCollapsed] = useState(true);
  const [customMetadataCollapsed, setCustomMetadataCollapsed] = useState(true);
  const [advancedOptionsCollapsed, setAdvancedOptionsCollapsed] = useState(true);

  const base = useBaseTool(
    'changeMetadata',
    useChangeMetadataParameters,
    useChangeMetadataOperation,
    props,
  );

  // Extract metadata from uploaded files
  const { isExtractingMetadata } = useMetadataExtraction(base.params);

  // Compute actual collapsed state based on results and user state
  const getActualCollapsedState = (userCollapsed: boolean) => {
    return (!base.hasFiles || base.hasResults) ? true : userCollapsed; // Force collapse when results are shown
  };

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
    },
    steps: [
      {
        title: t("changeMetadata.deleteAll.label", "Delete All Metadata"),
        isCollapsed: getActualCollapsedState(deleteAllCollapsed),
        onCollapsedClick: base.hasResults
          ? (base.settingsCollapsed ? base.handleSettingsReset : undefined)
          : () => setDeleteAllCollapsed(!deleteAllCollapsed),
        tooltip: deleteAllTips,
        content: (
          <DeleteAllStep
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading || isExtractingMetadata}
          />
        ),
      },
      {
        title: t("changeMetadata.standardFields.title", "Standard Metadata"),
        isCollapsed: getActualCollapsedState(standardMetadataCollapsed),
        onCollapsedClick: base.hasResults
          ? (base.settingsCollapsed ? base.handleSettingsReset : undefined)
          : () => setStandardMetadataCollapsed(!standardMetadataCollapsed),
        tooltip: standardMetadataTips,
        content: (
          <StandardMetadataStep
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading || base.params.parameters.deleteAll || isExtractingMetadata}
          />
        ),
      },
      {
        title: t("changeMetadata.dates.title", "Document Dates"),
        isCollapsed: getActualCollapsedState(documentDatesCollapsed),
        onCollapsedClick: base.hasResults
          ? (base.settingsCollapsed ? base.handleSettingsReset : undefined)
          : () => setDocumentDatesCollapsed(!documentDatesCollapsed),
        tooltip: documentDatesTips,
        content: (
          <DocumentDatesStep
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading || base.params.parameters.deleteAll || isExtractingMetadata}
          />
        ),
      },
      {
        title: t("changeMetadata.customFields.title", "Custom Metadata"),
        isCollapsed: getActualCollapsedState(customMetadataCollapsed),
        onCollapsedClick: base.hasResults
          ? (base.settingsCollapsed ? base.handleSettingsReset : undefined)
          : () => setCustomMetadataCollapsed(!customMetadataCollapsed),
        tooltip: customMetadataTips,
        content: (
          <CustomMetadataStep
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading || base.params.parameters.deleteAll || isExtractingMetadata}
            addCustomMetadata={base.params.addCustomMetadata}
            removeCustomMetadata={base.params.removeCustomMetadata}
            updateCustomMetadata={base.params.updateCustomMetadata}
          />
        ),
      },
      {
        title: t("changeMetadata.advanced.title", "Advanced Options"),
        isCollapsed: getActualCollapsedState(advancedOptionsCollapsed),
        onCollapsedClick: base.hasResults
          ? (base.settingsCollapsed ? base.handleSettingsReset : undefined)
          : () => setAdvancedOptionsCollapsed(!advancedOptionsCollapsed),
        tooltip: advancedOptionsTips,
        content: (
          <AdvancedOptionsStep
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading || isExtractingMetadata}
          />
        ),
      },
    ],
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
