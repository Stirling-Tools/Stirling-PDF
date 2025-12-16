import { useTranslation } from "react-i18next";
import { useState, useEffect, useRef } from "react";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import RedactModeSelector from "@app/components/tools/redact/RedactModeSelector";
import { useRedactParameters, RedactMode } from "@app/hooks/tools/redact/useRedactParameters";
import { useRedactOperation } from "@app/hooks/tools/redact/useRedactOperation";
import { useBaseTool } from "@app/hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "@app/types/tool";
import { useRedactModeTips, useRedactWordsTips, useRedactAdvancedTips, useRedactManualTips } from "@app/components/tooltips/useRedactTips";
import RedactAdvancedSettings from "@app/components/tools/redact/RedactAdvancedSettings";
import WordsToRedactInput from "@app/components/tools/redact/WordsToRedactInput";
import ManualRedactionControls from "@app/components/tools/redact/ManualRedactionControls";
import { useNavigationActions, useNavigationState } from "@app/contexts/NavigationContext";
import { useRedaction } from "@app/contexts/RedactionContext";

const Redact = (props: BaseToolProps) => {
  const { t } = useTranslation();

  // State for managing step collapse status
  const [methodCollapsed, setMethodCollapsed] = useState(false);
  const [wordsCollapsed, setWordsCollapsed] = useState(false);
  const [advancedCollapsed, setAdvancedCollapsed] = useState(true);

  // Navigation and redaction context
  const { actions: navActions } = useNavigationActions();
  const { setRedactionConfig, setRedactionMode, redactionConfig } = useRedaction();
  const { workbench } = useNavigationState();
  const hasOpenedViewer = useRef(false);

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
  const manualTips = useRedactManualTips();

  // Auto-set manual mode if we're in the viewer and redaction config is set to manual
  // This ensures when opening redact from viewer, it automatically selects manual mode
  useEffect(() => {
    if (workbench === 'viewer' && redactionConfig?.mode === 'manual' && base.params.parameters.mode !== 'manual') {
      // Set immediately when conditions are met
      base.params.updateParameter('mode', 'manual');
    }
  }, [workbench, redactionConfig, base.params.parameters.mode, base.params.updateParameter]);

  // Handle mode change - navigate to viewer when manual mode is selected
  const handleModeChange = (mode: RedactMode) => {
    base.params.updateParameter('mode', mode);
    
    if (mode === 'manual' && base.hasFiles) {
      // Set redaction config and navigate to viewer
      setRedactionConfig(base.params.parameters);
      setRedactionMode(true);
      navActions.setWorkbench('viewer');
      hasOpenedViewer.current = true;
    }
  };

  // When files are added and in manual mode, navigate to viewer
  useEffect(() => {
    if (base.params.parameters.mode === 'manual' && base.hasFiles && !hasOpenedViewer.current) {
      setRedactionConfig(base.params.parameters);
      setRedactionMode(true);
      navActions.setWorkbench('viewer');
      hasOpenedViewer.current = true;
    }
  }, [base.hasFiles, base.params.parameters, navActions, setRedactionConfig, setRedactionMode]);

  // Reset viewer flag when mode changes back to automatic
  useEffect(() => {
    if (base.params.parameters.mode === 'automatic') {
      hasOpenedViewer.current = false;
      setRedactionMode(false);
    }
  }, [base.params.parameters.mode, setRedactionMode]);

  const isExecuteDisabled = () => {
    if (base.params.parameters.mode === 'manual') {
      return true; // Manual mode uses viewer, not execute button
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
            onModeChange={handleModeChange}
            disabled={base.endpointLoading}
            hasFiles={base.hasFiles}
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
      // Manual mode - show redaction controls
      steps.push({
        title: t("redact.manual.controlsTitle", "Manual Redaction Controls"),
        isCollapsed: false,
        onCollapsedClick: () => {},
        tooltip: manualTips,
        content: <ManualRedactionControls disabled={!base.hasFiles} />,
      });
    }

    return steps;
  };

  // Hide execute button in manual mode (redactions applied via controls)
  const isManualMode = base.params.parameters.mode === 'manual';

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
    },
    steps: buildSteps(),
    executeButton: {
      text: t("redact.submit", "Redact"),
      isVisible: !base.hasResults && !isManualMode,
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
