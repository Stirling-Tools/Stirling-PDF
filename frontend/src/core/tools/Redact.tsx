import { useTranslation } from "react-i18next";
import { useState } from "react";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import RedactModeSelector from "@app/components/tools/redact/RedactModeSelector";
import { useRedactParameters } from "@app/hooks/tools/redact/useRedactParameters";
import { useRedactOperation } from "@app/hooks/tools/redact/useRedactOperation";
import { useBaseTool } from "@app/hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "@app/types/tool";
import { useRedactModeTips, useRedactWordsTips, useRedactAdvancedTips } from "@app/components/tooltips/useRedactTips";
import RedactAdvancedSettings from "@app/components/tools/redact/RedactAdvancedSettings";
import WordsToRedactInput from "@app/components/tools/redact/WordsToRedactInput";

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
    return (!base.hasFiles || base.hasResults) ? true : userCollapsed; // Force collapse when results are shown
  };

  // Build conditional steps based on redaction mode
  const buildSteps = () => {
    const steps = [
      // Method selection step (always present)
      {
        title: t("redact.modeSelector.title", "Redaction Method"),
        isCollapsed: getActualCollapsedState(methodCollapsed),
        onCollapsedClick: () => base.settingsCollapsed ? base.handleSettingsReset() : setMethodCollapsed(!methodCollapsed),
        tooltip: modeTips,
        content: (
          <RedactModeSelector
            mode={base.params.parameters.mode}
            onModeChange={(mode) => base.params.updateParameter('mode', mode)}
            disabled={base.endpointLoading}
          />
        ),
      }
    ];

    // Add mode-specific steps
    if (base.params.parameters.mode === 'automatic') {
      steps.push(
        {
          title: t("redact.auto.settings.title", "Redaction Settings"),
          isCollapsed: getActualCollapsedState(wordsCollapsed),
          onCollapsedClick: () => base.settingsCollapsed ? base.handleSettingsReset() : setWordsCollapsed(!wordsCollapsed),
          tooltip: wordsTips,
          content: <WordsToRedactInput
            wordsToRedact={base.params.parameters.wordsToRedact}
            onWordsChange={(words) => base.params.updateParameter('wordsToRedact', words)}
            disabled={base.endpointLoading}
          />,
        },
        {
          title: t("redact.auto.settings.advancedTitle", "Advanced Settings"),
          isCollapsed: getActualCollapsedState(advancedCollapsed),
          onCollapsedClick: () => base.settingsCollapsed ? base.handleSettingsReset() : setAdvancedCollapsed(!advancedCollapsed),
          tooltip: advancedTips,
          content: <RedactAdvancedSettings
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading}
          />,
        },
      );
    } else if (base.params.parameters.mode === 'manual') {
      // Manual mode steps would go here when implemented
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
