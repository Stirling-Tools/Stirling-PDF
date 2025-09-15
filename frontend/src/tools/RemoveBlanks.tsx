import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { createToolFlow } from "../components/tools/shared/createToolFlow";
import { BaseToolProps, ToolComponent } from "../types/tool";
import { useBaseTool } from "../hooks/tools/shared/useBaseTool";
import { useRemoveBlanksParameters } from "../hooks/tools/removeBlanks/useRemoveBlanksParameters";
import { useRemoveBlanksOperation } from "../hooks/tools/removeBlanks/useRemoveBlanksOperation";
import RemoveBlanksSettings from "../components/tools/removeBlanks/RemoveBlanksSettings";

const RemoveBlanks = (props: BaseToolProps) => {
  const { t } = useTranslation();

  const base = useBaseTool(
    'remove-blanks',
    useRemoveBlanksParameters,
    useRemoveBlanksOperation,
    props
  );

  // Step expansion state management
  const [expandedStep, setExpandedStep] = useState<"files" | "advanced" | null>("files");

  // Auto-expand advanced when files are selected
  useEffect(() => {
    if (base.selectedFiles.length > 0 && expandedStep === "files") {
      setExpandedStep("advanced");
    }
  }, [base.selectedFiles.length, expandedStep]);

  // Collapse all steps when results appear
  useEffect(() => {
    if (base.hasResults) {
      setExpandedStep(null);
    }
  }, [base.hasResults]);

  const settingsContent = (
    <RemoveBlanksSettings
      parameters={base.params.parameters}
      onParameterChange={base.params.updateParameter}
      disabled={base.endpointLoading}
    />
  );

  const handleAdvancedClick = () => {
    if (base.hasResults) {
      base.handleSettingsReset();
    } else {
      if (!base.hasFiles) return; 
      setExpandedStep(expandedStep === "advanced" ? null : "advanced");
    }
  };

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
    },
    steps: [
      {
        title: t("removeBlanks.advanced.title", "Advanced"),
        isCollapsed: expandedStep !== "advanced",
        onCollapsedClick: handleAdvancedClick,
        content: settingsContent,
      },
    ],
    executeButton: {
      text: t("removeBlanks.submit", "Remove blank pages"),
      loadingText: t("loading"),
      onClick: base.handleExecute,
      isVisible: !base.hasResults,
      disabled: !base.params.validateParameters() || !base.hasFiles || !base.endpointEnabled,
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t("removeBlanks.results.title", "Removed Blank Pages"),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

RemoveBlanks.tool = () => useRemoveBlanksOperation;

export default RemoveBlanks as ToolComponent;


