import { useTranslation } from "react-i18next";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Stack, Text } from "@mantine/core";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import type { MiddleStepConfig } from "@app/components/tools/shared/createToolFlow";
import RedactModeSelector from "@app/components/tools/redact/RedactModeSelector";
import { useRedactParameters } from "@app/hooks/tools/redact/useRedactParameters";
import { useRedactOperation } from "@app/hooks/tools/redact/useRedactOperation";
import { useBaseTool } from "@app/hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "@app/types/tool";
import { useRedactModeTips, useRedactWordsTips, useRedactAdvancedTips } from "@app/components/tooltips/useRedactTips";
import RedactAdvancedSettings from "@app/components/tools/redact/RedactAdvancedSettings";
import WordsToRedactInput from "@app/components/tools/redact/WordsToRedactInput";
import { useViewer } from "@app/contexts/ViewerContext";
import { useNavigationActions, useNavigationState } from "@app/contexts/NavigationContext";
import ButtonSelector from "@app/components/shared/ButtonSelector";
import { useFileContext } from "@app/contexts/file/fileHooks";
import type { StirlingFile } from "@app/types/fileContext";
import { createStirlingFilesAndStubs } from "@app/services/fileStubHelpers";

const Redact = (props: BaseToolProps) => {
  const { t } = useTranslation();
  const navigationState = useNavigationState();
  const { actions: navActions } = useNavigationActions();
  const { actions: fileActions, selectors } = useFileContext();
  const { redactionActions, getRedactionDesiredMode, registerImmediateRedactionModeUpdate } = useViewer();

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

  // Manual apply/export using the viewer
  const handleApplyAndSave = useCallback(async () => {
    if (base.selectedFiles.length !== 1) return;
    const [selected] = base.selectedFiles as [StirlingFile];
    // Apply pending redactions in viewer
    await redactionActions.applyRedactions();
    const blob = await redactionActions.exportRedactedBlob();
    if (!blob) return;
    const outputName = (() => {
      const name = selected.name || 'document.pdf';
      const lower = name.toLowerCase();
      if (lower.includes('redacted')) return name;
      const i = name.lastIndexOf('.');
      if (i === -1) return `${name}_redacted.pdf`;
      const baseName = name.slice(0, i);
      const ext = name.slice(i);
      return `${baseName}_redacted${ext}`;
    })();
    const exportedFile = new File([blob], outputName, { type: 'application/pdf' });
    const parentStub = selectors.getStirlingFileStub(selected.fileId);
    if (!parentStub) return;
    const { stirlingFiles, stubs } = await createStirlingFilesAndStubs([exportedFile], parentStub, 'redact');
    await fileActions.consumeFiles([selected.fileId], stirlingFiles, stubs);
  }, [base.selectedFiles, redactionActions, selectors, fileActions]);

  // Tooltips for each step
  const modeTips = useRedactModeTips();
  const wordsTips = useRedactWordsTips();
  const advancedTips = useRedactAdvancedTips();

  const isManualMode = base.params.parameters.mode === 'manual';
  const isRedactToolActive = navigationState.selectedTool === 'redact';
  // Drive button highlight from user's desired mode so it stays blue even when plugin temporarily clears it
  const [activeMode, setActiveMode] = useState<'text' | 'area' | null>(getRedactionDesiredMode?.() ?? null);
  useEffect(() => {
    registerImmediateRedactionModeUpdate((mode) => setActiveMode(mode));
  }, [registerImmediateRedactionModeUpdate]);

  // Track first-time initialization for manual mode
  const manualInitRef = useRef(false);

  // When switching to Manual the first time, jump to viewer and default to Area selection
  useEffect(() => {
    if (!isManualMode) {
      manualInitRef.current = false;
      return;
    }

    if (!manualInitRef.current) {
      manualInitRef.current = true;
      // Navigate to viewer first
      if (navigationState.workbench !== 'viewer') {
        navActions.setWorkbench('viewer');
      }
      // Then activate area mode after a short delay to ensure plugin is ready
      setTimeout(() => {
        navActions.setSelectedTool('redact');
        redactionActions.activateArea();
        setActiveMode('area');
      }, 100);
    }
  }, [isManualMode, navigationState.workbench, navActions, redactionActions]);

  // Ensure one mode is always active when manual redaction is enabled
  useEffect(() => {
    if (!isManualMode || navigationState.workbench !== 'viewer') return;
    // If no mode is active and manual redaction is enabled, default to area
    if (!activeMode) {
      setActiveMode('area');
      redactionActions.activateArea();
    }
  }, [isManualMode, activeMode, navigationState.workbench, redactionActions]);

  // If user triggers redaction mode from viewer (desiredMode present) while tool is open,
  // automatically switch panel to Manual so the manual controls are visible.
  useEffect(() => {
    const desired = getRedactionDesiredMode?.() ?? null;
    if (navigationState.selectedTool === 'redact' && desired && base.params.parameters.mode !== 'manual') {
      base.params.updateParameter('mode', 'manual' as any);
    }
  }, [navigationState.selectedTool, getRedactionDesiredMode, base.params, base.params.parameters.mode]);

  const isExecuteDisabled = () => {
    if (isManualMode) {
      return true;
    }
    return !base.params.validateParameters() || !base.hasFiles || !base.endpointEnabled;
  };

  // Compute actual collapsed state based on results and user state
  const getActualCollapsedState = (userCollapsed: boolean) => {
    return (!base.hasFiles || base.hasResults) ? true : userCollapsed; // Force collapse when results are shown
  };

  // Build conditional steps based on redaction mode
  const buildSteps = () => {
    const steps: MiddleStepConfig[] = [
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
    if (!isManualMode && base.params.parameters.mode === 'automatic') {
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
    } else if (isManualMode) {

  steps.push({
        title: t("redact.manual.stepTitle", "Manual redaction"),
        isCollapsed: false,
        content: (
          <Stack gap="sm">
            {/* View mode guard - only after initial manual init */}
            {navigationState.workbench !== 'viewer' && manualInitRef.current && (
              <Alert color="yellow" variant="light">
                <Stack gap={6}>
                  <Text size="sm">{t('redact.manual.viewerRequired', 'You must return to the viewer to use manual redaction.')}</Text>
                  <Button size="xs" variant="filled" color="blue" onClick={() => navActions.setWorkbench('viewer')}>
                    {t('redact.manual.goToViewer', 'Go to viewer')}
                  </Button>
                </Stack>
              </Alert>
            )}

            {/* Allow multiple files; viewer dropdown lets users switch between them */}

            {/* Label and mode toggles */}
            <Text size="sm" fw={500}>{t('redact.manual.applyBy', 'Apply redaction by')}</Text>
            <ButtonSelector
              value={activeMode || undefined}
              onChange={(mode: 'text' | 'area') => {
                // Prevent deselection - always keep one mode active
                // If clicking the same button, do nothing (don't clear)
                if (activeMode === mode) return;
                
                // Immediately set and persist requested mode
                setActiveMode(mode);
                navActions.setSelectedTool('redact');
                if (mode === 'text') {
                  redactionActions.activateText();
                } else if (mode === 'area') {
                  redactionActions.activateArea();
                }
              }}
              disabled={navigationState.workbench !== 'viewer'}
              options={[
                { value: 'text', label: t('redact.manual.buttons.text', 'Text Selection') },
                { value: 'area', label: t('redact.manual.buttons.area', 'Area Selection') },
              ]}
            />

            {/* Save button is now consolidated in right rail. */}
          </Stack>
        )
      });
    }

    return steps;
  };

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
      // Allow multiple files for manual redaction (viewer dropdown handles switching)
      minFiles: undefined,
    },
    steps: buildSteps(),
    executeButton: isManualMode ? undefined : {
      text: t("redact.submit", "Redact"),
      isVisible: !base.hasResults,
      loadingText: t("loading"),
      onClick: base.handleExecute,
      disabled: isExecuteDisabled(),
    },
    review: {
      isVisible: !isManualMode && base.hasResults,
      operation: base.operation,
      title: t("redact.title", "Redaction Results"),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

export default Redact as ToolComponent;
