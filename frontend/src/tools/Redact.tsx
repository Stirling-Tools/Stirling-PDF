import { useTranslation } from "react-i18next";
import { useState } from "react";
import { createToolFlow } from "../components/tools/shared/createToolFlow";
import RedactModeStep from "../components/tools/redact/RedactModeStep";
import RedactWordsStep from "../components/tools/redact/RedactWordsStep";
import RedactAdvancedStep from "../components/tools/redact/RedactAdvancedStep";
import { useRedactParameters } from "../hooks/tools/redact/useRedactParameters";
import { useRedactOperation } from "../hooks/tools/redact/useRedactOperation";
import { useBaseTool } from "../hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "../types/tool";
import { useRedactModeTips, useRedactWordsTips, useRedactAdvancedTips } from "../components/tooltips/useRedactTips";

const Redact = (props: BaseToolProps) => {
  const { t } = useTranslation();

  // State for managing step collapse status
  const [methodCollapsed, setMethodCollapsed] = useState(false);
  const [wordsCollapsed, setWordsCollapsed] = useState(false);
  const [advancedCollapsed, setAdvancedCollapsed] = useState(true);

  const base = useBaseTool(
    'redact',
    useRedactParameters,
    useRedactOperation,
    props
  );

  // Tooltips for each step
  const modeTips = useRedactModeTips();
  const wordsTips = useRedactWordsTips();
  const advancedTips = useRedactAdvancedTips();

  const isExecuteDisabled = () => {
    if (base.params.parameters.mode === 'manual') {
      return true; // Manual mode not implemented yet
    }
    return !base.params.validateParameters() || !base.hasFiles || !base.endpointEnabled;
  };

  // Compute actual collapsed state based on results and user state
  const getActualCollapsedState = (userCollapsed: boolean) => {
    return base.hasResults ? true : userCollapsed; // Force collapse when results are shown
  };

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
    },
    steps: [
      {
        title: t("redact.steps.method", "Method"),
        isCollapsed: getActualCollapsedState(methodCollapsed),
        onCollapsedClick: () => base.settingsCollapsed ? base.handleSettingsReset() : setMethodCollapsed(!methodCollapsed),
        tooltip: modeTips,
        content: (
          <RedactModeStep
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading}
          />
        ),
      },
      {
        title: t("redact.steps.words", "Words to Redact"),
        isCollapsed: getActualCollapsedState(wordsCollapsed),
        onCollapsedClick: () => base.settingsCollapsed ? base.handleSettingsReset() : setWordsCollapsed(!wordsCollapsed),
        tooltip: wordsTips,
        content: (
          <RedactWordsStep
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading}
          />
        ),
      },
      {
        title: t("redact.steps.advanced", "Advanced Settings"),
        isCollapsed: getActualCollapsedState(advancedCollapsed),
        onCollapsedClick: () => base.settingsCollapsed ? base.handleSettingsReset() : setAdvancedCollapsed(!advancedCollapsed),
        tooltip: advancedTips,
        content: (
          <RedactAdvancedStep
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading}
          />
        ),
      },
    ],
    executeButton: {
      text: t("redact.submit", "Redact"),
      isVisible: !base.hasResults,
      loadingText: t("loading"),
      onClick: base.handleExecute,
      disabled: isExecuteDisabled(),
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t("redact.title", "Redaction Results"),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

export default Redact as ToolComponent;
