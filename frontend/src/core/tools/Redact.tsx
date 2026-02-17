import { useTranslation } from "react-i18next";
import { useState, useEffect, useRef } from "react";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import RedactModeSelector from "@app/components/tools/redact/RedactModeSelector";
import { useRedactParameters, RedactMode } from "@app/hooks/tools/redact/useRedactParameters";
import { useRedactOperation } from "@app/hooks/tools/redact/useRedactOperation";
import { useBaseTool } from "@app/hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "@app/types/tool";
import { useRedactModeTips, useRedactManualTips } from "@app/components/tooltips/useRedactTips";
import ManualRedactionControls from "@app/components/tools/redact/ManualRedactionControls";
import SearchAndRedactControls from "@app/components/tools/redact/SearchAndRedactControls";
import { useNavigationActions, useNavigationState } from "@app/contexts/NavigationContext";
import { useRedaction } from "@app/contexts/RedactionContext";
import { useFileState } from "@app/contexts/file/fileHooks";

const Redact = (props: BaseToolProps) => {
  const { t } = useTranslation();

  // State for managing step collapse status
  const [methodCollapsed, setMethodCollapsed] = useState(false);

  // Navigation and redaction context
  const { actions: navActions } = useNavigationActions();
  const { setRedactionConfig, setRedactionMode, redactionConfig, deactivateRedact } = useRedaction();
  const { workbench } = useNavigationState();
  const hasOpenedViewer = useRef(false);

  const base = useBaseTool(
    'redact',
    useRedactParameters,
    useRedactOperation,
    props
  );

  // Get total file count from context (any files in workbench, not just selected)
  const { state: fileState } = useFileState();
  const hasAnyFiles = fileState.files.ids.length > 0;

  // Tooltips for each step
  const modeTips = useRedactModeTips();
  const manualTips = useRedactManualTips();

  // Auto-set manual mode if we're in the viewer and redaction config is set to manual
  // This ensures when opening redact from viewer, it automatically selects manual mode
  useEffect(() => {
    if (workbench === 'viewer' && redactionConfig?.mode === 'manual' && base.params.parameters.mode !== 'manual') {
      // Set immediately when conditions are met
      base.params.updateParameter('mode', 'manual');
    }
  }, [workbench, redactionConfig, base.params.parameters.mode, base.params.updateParameter]);

  // Handle mode change - navigate to viewer for both modes
  // Both modes work with the EmbedPDF viewer
  const handleModeChange = (mode: RedactMode) => {
    // Deactivate manual redaction tool when switching away from manual mode
    if (base.params.parameters.mode === 'manual' && mode !== 'manual') {
      try { deactivateRedact(); } catch { /* ignore if bridge not ready */ }
    }

    base.params.updateParameter('mode', mode);
    
    if (hasAnyFiles) {
      // Construct config with the NEW mode value explicitly.
      // base.params.parameters still has the old mode (React state is async),
      // so we override it here to prevent the useEffect from reverting the switch.
      const newConfig = { ...base.params.parameters, mode };
      setRedactionConfig(newConfig);
      setRedactionMode(true);
      navActions.setWorkbench('viewer');
      hasOpenedViewer.current = true;
    }
  };

  // When files are added and in any mode, navigate to viewer
  useEffect(() => {
    if (hasAnyFiles && !hasOpenedViewer.current) {
      setRedactionConfig(base.params.parameters);
      setRedactionMode(true);
      navActions.setWorkbench('viewer');
      hasOpenedViewer.current = true;
    }
  }, [hasAnyFiles, base.params.parameters, navActions, setRedactionConfig, setRedactionMode]);

  // Reset viewer flag when switching modes
  // Both modes use the viewer so we don't need to exit redaction mode

  const isExecuteDisabled = () => {
    return true; // Both modes use viewer-based controls, not the execute button
  };

  // Compute actual collapsed state based on results and user state
  const getActualCollapsedState = (userCollapsed: boolean) => {
    return (!base.hasFiles || base.hasResults) ? true : userCollapsed; // Force collapse when results are shown
  };

  // Build conditional steps based on redaction mode
  const buildSteps = () => {
    // Method step is always expandable (even without files selected)
    // Only collapse on results or user preference
    const methodStepCollapsed = base.hasResults ? true : methodCollapsed;
    
    const steps = [
      // Method selection step (always present and always expandable)
      {
        title: t("redact.modeSelector.title", "Redaction Method"),
        isCollapsed: methodStepCollapsed,
        onCollapsedClick: () => base.settingsCollapsed ? base.handleSettingsReset() : setMethodCollapsed(!methodCollapsed),
        tooltip: modeTips,
        content: (
          <RedactModeSelector
            mode={base.params.parameters.mode}
            onModeChange={handleModeChange}
            disabled={base.endpointLoading}
            hasFilesSelected={base.hasFiles}
            hasAnyFiles={hasAnyFiles}
          />
        ),
      }
    ];

    // Add mode-specific steps
    if (base.params.parameters.mode === 'automatic') {
      // Search & Redact mode - show search controls in sidebar
      steps.push({
        title: t("redact.searchAndRedact.controlsTitle", "Search & Redact Controls"),
        isCollapsed: false,
        onCollapsedClick: () => {},
        tooltip: manualTips, // Reuse tips for now
        content: <SearchAndRedactControls disabled={!hasAnyFiles} />,
      });
    } else if (base.params.parameters.mode === 'manual') {
      // Manual mode - show redaction controls
      // Uses hasAnyFiles since manual mode works with any files in workbench (viewer-powered)
      steps.push({
        title: t("redact.manual.controlsTitle", "Manual Redaction Controls"),
        isCollapsed: false,
        onCollapsedClick: () => {},
        tooltip: manualTips,
        content: <ManualRedactionControls disabled={!hasAnyFiles} />,
      });
    }

    return steps;
  };

  // Hide execute button for both modes (redactions applied via viewer controls)
  const hideExecuteButton = true;

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
    },
    steps: buildSteps(),
    executeButton: {
      text: t("redact.submit", "Redact"),
      isVisible: !base.hasResults && !hideExecuteButton,
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
