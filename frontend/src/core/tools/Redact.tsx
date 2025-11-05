import { useTranslation } from "react-i18next";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import RedactModeSelector from "@app/components/tools/redact/RedactModeSelector";
import { useRedactParameters } from "@app/hooks/tools/redact/useRedactParameters";
import { useRedactOperation } from "@app/hooks/tools/redact/useRedactOperation";
import { useBaseTool } from "@app/hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "@app/types/tool";
import { useRedactModeTips, useRedactWordsTips, useRedactAdvancedTips, useRedactManualTips } from "@app/components/tooltips/useRedactTips";
import RedactAdvancedSettings from "@app/components/tools/redact/RedactAdvancedSettings";
import WordsToRedactInput from "@app/components/tools/redact/WordsToRedactInput";
import RedactManualControls, { ManualRedactionType } from "@app/components/tools/redact/RedactManualControls";
import { useNavigationActions, useNavigationState } from "@app/contexts/NavigationContext";
import { useViewer } from "@app/contexts/ViewerContext";
import { Stack, Alert, Button, Text } from "@mantine/core";
import WarningIcon from '@mui/icons-material/Warning';

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
  const manualTips = useRedactManualTips();

  // Navigation for switching to viewer on Manual
  const { actions: navActions } = useNavigationActions();
  const { workbench } = useNavigationState();
  const viewer = useViewer();

  // Extract stable references to viewer methods to avoid re-renders from context changes
  const getRedactionStateRef = useRef(viewer.getRedactionState);
  const registerToolModeListenerRef = useRef(viewer.registerToolModeListener);
  const unregisterToolModeListenerRef = useRef(viewer.unregisterToolModeListener);
  const redactionActionsRef = useRef(viewer.redactionActions);
  const setAnnotationModeRef = useRef(viewer.setAnnotationMode);
  const panActionsRef = useRef(viewer.panActions);
  const triggerToolModeUpdateRef = useRef(viewer.triggerToolModeUpdate);
  
  // Update refs when viewer context changes (but don't cause re-renders)
  useEffect(() => {
    getRedactionStateRef.current = viewer.getRedactionState;
    registerToolModeListenerRef.current = viewer.registerToolModeListener;
    unregisterToolModeListenerRef.current = viewer.unregisterToolModeListener;
    redactionActionsRef.current = viewer.redactionActions;
    setAnnotationModeRef.current = viewer.setAnnotationMode;
    panActionsRef.current = viewer.panActions;
    triggerToolModeUpdateRef.current = viewer.triggerToolModeUpdate;
  }, [viewer]);

  // Force re-render when tool mode changes to ensure buttons reflect current state
  const [updateCounter, setUpdateCounter] = useState(0);
  useEffect(() => {
    const handleToolModeUpdate = () => {
      setUpdateCounter(prev => prev + 1);
    };
    registerToolModeListenerRef.current(handleToolModeUpdate);
    return () => {
      unregisterToolModeListenerRef.current();
    };
  }, []); // Empty deps - refs are stable

  // Track redaction state to ensure UI stays in sync with plugin state
  // Use a ref to track the last known state and only update when it changes
  const [redactionStateCheck, setRedactionStateCheck] = useState(0);
  const lastRedactionStateRef = useRef<{ activeType: string | null; pendingCount: number } | null>(null);
  
  useEffect(() => {
    if (base.params.parameters.mode !== 'manual') return;
    
    // Check redaction state periodically, but only update if it actually changed
    const interval = setInterval(() => {
      const currentState = getRedactionStateRef.current();
      const lastState = lastRedactionStateRef.current;
      
      // Only trigger update if activeType changed (not just pendingCount)
      if (!lastState || lastState.activeType !== currentState.activeType) {
        lastRedactionStateRef.current = {
          activeType: currentState.activeType,
          pendingCount: currentState.pendingCount,
        };
        setRedactionStateCheck(prev => prev + 1);
      } else {
        // Update ref even if we don't trigger re-render
        lastRedactionStateRef.current = {
          activeType: currentState.activeType,
          pendingCount: currentState.pendingCount,
        };
      }
    }, 500); // Check less frequently - only when mode actually changes
    
    return () => clearInterval(interval);
  }, [base.params.parameters.mode]); // Removed viewer dependency

  // Check if we need to show the viewer warning
  const isManualModeOutsideViewer = base.params.parameters.mode === 'manual' && workbench !== 'viewer';

  const handleEnterManual = useCallback(() => {
    // Mark that manual redaction should be initialized and activate last mode
    sessionStorage.setItem('redaction:init', 'manual');
    // Persist current choice if any
    const last = (sessionStorage.getItem('redaction:lastManualType') as ManualRedactionType | null) || 'redactSelection';
    sessionStorage.setItem('redaction:lastManualType', last);
    // Switch to viewer and show the Redact tool in sidebar
    navActions.setToolAndWorkbench('redact' as any, 'viewer');
    // Defer activation to ensure viewer is ready and other tools are disabled
    const activate = () => {
      try { setAnnotationModeRef.current(false); } catch {}
      try { panActionsRef.current.disablePan(); } catch {}
      const activateRedaction = () => {
        if (last === 'marqueeRedact') {
          redactionActionsRef.current.activateArea();
        } else {
          redactionActionsRef.current.activateText();
        }
        try { triggerToolModeUpdateRef.current(); } catch {}
      };
      // Use double deferral to ensure state is settled
      if (typeof window !== 'undefined' && 'requestAnimationFrame' in window) {
        requestAnimationFrame(() => setTimeout(activateRedaction, 0));
      } else {
        setTimeout(activateRedaction, 0);
      }
    };
    // Defer activation slightly to allow navigation to complete
    setTimeout(activate, 50);
  }, [navActions]);

  const isExecuteDisabled = () => {
    if (base.params.parameters.mode === 'manual') {
      return true; // Manual mode not implemented yet
    }
    return !base.params.validateParameters() || !base.hasFiles || !base.endpointEnabled;
  };

  // Compute actual collapsed state based on results and user state
  const getActualCollapsedState = useCallback((userCollapsed: boolean) => {
    return (!base.hasFiles || base.hasResults) ? true : userCollapsed; // Force collapse when results are shown
  }, [base.hasFiles, base.hasResults]);

  // Memoize redaction state to avoid calling getRedactionState on every render
  const redactionState = useMemo(() => {
    if (base.params.parameters.mode !== 'manual') return null;
    // Reference check counter to ensure re-evaluation when it changes
    void redactionStateCheck;
    return getRedactionStateRef.current();
  }, [base.params.parameters.mode, redactionStateCheck]);

  // Build conditional steps based on redaction mode
  const buildSteps = useCallback(() => {
    const steps = [
      // Method selection step (always present)
      {
        title: t("redact.modeSelector.title", "Redaction Method"),
        isCollapsed: getActualCollapsedState(methodCollapsed),
        onCollapsedClick: () => base.settingsCollapsed ? base.handleSettingsReset() : setMethodCollapsed(!methodCollapsed),
        tooltip: modeTips,
        content: (
          <Stack gap="md">
            <RedactModeSelector
              mode={base.params.parameters.mode}
              onModeChange={(mode) => {
                base.params.updateParameter('mode', mode);
                if (mode === 'manual') {
                  handleEnterManual();
                }
              }}
              disabled={base.endpointLoading}
            />
            {isManualModeOutsideViewer && (
              <Alert
                color="yellow"
                title={t("redact.manual.viewerWarning.title", "Manual Redaction Requires Viewer")}
                icon={<WarningIcon fontSize="small" />}
              >
                <Stack gap="sm">
                  <Text size="sm">
                    {t("redact.manual.viewerWarning.message", "Manual redaction can only be used in the viewer view. Please switch to the viewer to use this feature.")}
                  </Text>
                  <Button
                    size="sm"
                    variant="light"
                    onClick={() => {
                      handleEnterManual();
                    }}
                    style={{ alignSelf: 'flex-start' }}
                  >
                    {t("redact.manual.viewerWarning.button", "Go to Viewer")}
                  </Button>
                </Stack>
              </Alert>
            )}
          </Stack>
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
      steps.push({
        title: t("redact.manual.settings.title", "Manual Redaction"),
        isCollapsed: getActualCollapsedState(false),
        onCollapsedClick: () => {},
        tooltip: manualTips,
        content: (
          <RedactManualControls
            value={
              // Get actual active mode from redaction plugin, fallback to sessionStorage
              // redactionStateCheck changes only when activeType actually changes
              (redactionState?.activeType as ManualRedactionType) ||
              (sessionStorage.getItem('redaction:lastManualType') as ManualRedactionType) ||
              'redactSelection'
            }
            onChange={(val) => {
              sessionStorage.setItem('redaction:lastManualType', val);
              // Ensure we're in viewer and activate chosen tool
              handleEnterManual();
              if (val === 'marqueeRedact') redactionActionsRef.current.activateArea();
              else redactionActionsRef.current.activateText();
              // Trigger a state check to update UI
              setRedactionStateCheck(prev => prev + 1);
            }}
            disabled={base.endpointLoading}
          />
        )
      });
    }

    return steps;
  }, [
    base.params.parameters, // Required for RedactAdvancedSettings prop
    base.hasFiles,
    base.hasResults,
    base.endpointLoading,
    base.params.updateParameter,
    methodCollapsed,
    wordsCollapsed,
    advancedCollapsed,
    modeTips,
    wordsTips,
    advancedTips,
    manualTips,
    isManualModeOutsideViewer,
    handleEnterManual,
    redactionState,
    t,
    getActualCollapsedState,
    base.settingsCollapsed,
    base.handleSettingsReset,
    setMethodCollapsed,
    setWordsCollapsed,
    setAdvancedCollapsed,
  ]);

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
