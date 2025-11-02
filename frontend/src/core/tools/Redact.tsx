import { useTranslation } from "react-i18next";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Stack, Text } from "@mantine/core";
import VisibilityOffRoundedIcon from "@mui/icons-material/VisibilityOffRounded";
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
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { useNavigationActions, useNavigationState } from "@app/contexts/NavigationContext";
import ManualRedactionWorkbenchView from "@app/components/tools/redact/ManualRedactionWorkbenchView";
import type { ManualRedactionWorkbenchData } from "@app/types/redact";
import { useFileContext } from "@app/contexts/file/fileHooks";
import type { StirlingFile } from "@app/types/fileContext";

const MANUAL_VIEW_ID = "manualRedactionWorkbench";
const MANUAL_WORKBENCH_ID = "custom:manualRedactionWorkbench" as const;

const Redact = (props: BaseToolProps) => {
  const { t } = useTranslation();
  const {
    registerCustomWorkbenchView,
    unregisterCustomWorkbenchView,
    setCustomWorkbenchViewData,
    clearCustomWorkbenchViewData,
  } = useToolWorkflow();
  const { actions: navigationActions } = useNavigationActions();
  const navigationState = useNavigationState();
  const { actions: fileActions } = useFileContext();
  const manualWorkbenchIcon = useMemo(() => <VisibilityOffRoundedIcon fontSize="small" />, []);

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

  const createManualWorkbenchData = useCallback((file: StirlingFile): ManualRedactionWorkbenchData => ({
    fileId: file.fileId,
    file,
    fileName: file.name,
    onExport: async (exportedFile: File) => {
      await fileActions.addFiles([exportedFile], { selectFiles: true });
    },
    onExit: () => {
      clearCustomWorkbenchViewData(MANUAL_VIEW_ID);
      navigationActions.setWorkbench('fileEditor');
    },
  }), [clearCustomWorkbenchViewData, fileActions, navigationActions]);

  const handleOpenManualEditor = useCallback(() => {
    if (base.selectedFiles.length !== 1) {
      return;
    }
    const [selected] = base.selectedFiles as [StirlingFile];
    const workbenchData = createManualWorkbenchData(selected);
    setCustomWorkbenchViewData(MANUAL_VIEW_ID, workbenchData);
    navigationActions.setWorkbench(MANUAL_WORKBENCH_ID);
  }, [base.selectedFiles, createManualWorkbenchData, navigationActions, setCustomWorkbenchViewData]);

  useEffect(() => {
    registerCustomWorkbenchView({
      id: MANUAL_VIEW_ID,
      workbenchId: MANUAL_WORKBENCH_ID,
      label: t('redact.manual.workbenchLabel', 'Manual redaction'),
      icon: manualWorkbenchIcon,
      component: ManualRedactionWorkbenchView,
    });

    return () => {
      clearCustomWorkbenchViewData(MANUAL_VIEW_ID);
      unregisterCustomWorkbenchView(MANUAL_VIEW_ID);
    };
  }, [
    clearCustomWorkbenchViewData,
    manualWorkbenchIcon,
    registerCustomWorkbenchView,
    t,
    unregisterCustomWorkbenchView,
  ]);

  useEffect(() => {
    if (base.params.parameters.mode !== 'manual') {
      clearCustomWorkbenchViewData(MANUAL_VIEW_ID);
      if (navigationState.workbench === MANUAL_WORKBENCH_ID) {
        navigationActions.setWorkbench('fileEditor');
      }
    }
  }, [
    base.params.parameters.mode,
    clearCustomWorkbenchViewData,
    navigationActions,
    navigationState.workbench,
  ]);

  useEffect(() => {
    if (
      navigationState.workbench !== MANUAL_WORKBENCH_ID ||
      base.params.parameters.mode !== 'manual' ||
      base.selectedFiles.length !== 1
    ) {
      return;
    }
    const [selected] = base.selectedFiles as [StirlingFile];
    setCustomWorkbenchViewData(MANUAL_VIEW_ID, createManualWorkbenchData(selected));
  }, [
    base.params.parameters.mode,
    base.selectedFiles,
    createManualWorkbenchData,
    navigationState.workbench,
    setCustomWorkbenchViewData,
  ]);

  // Tooltips for each step
  const modeTips = useRedactModeTips();
  const wordsTips = useRedactWordsTips();
  const advancedTips = useRedactAdvancedTips();

  const isManualMode = base.params.parameters.mode === 'manual';

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
      const manualHasFile = base.selectedFiles.length > 0;
      const manualHasSingleFile = base.selectedFiles.length === 1;
      const manualTooManyFiles = base.selectedFiles.length > 1;
      const selectedName = manualHasSingleFile ? base.selectedFiles[0].name : null;

      steps.push({
        title: t("redact.manual.stepTitle", "Manual redaction editor"),
        isCollapsed: false,
        content: (
          <Stack gap="sm">
            <Text size="sm">
              {manualHasSingleFile
                ? t("redact.manual.stepDescriptionSelected", "Launch the editor to mark redactions on {{file}}.", { file: selectedName })
                : t("redact.manual.stepDescription", "Open the embedded redaction editor to draw boxes or search for sensitive text.")}
            </Text>
            {manualTooManyFiles && (
              <Alert color="red" variant="light">
                {t("redact.manual.multipleNotSupported", "Manual redaction works on one PDF at a time. Deselect extra files to continue.")}
              </Alert>
            )}
            {!manualHasFile && (
              <Alert color="blue" variant="light">
                {t("redact.manual.noFileSelectedInfo", "Select a PDF from the file sidebar to begin manual redaction.")}
              </Alert>
            )}
            <Button
              variant="filled"
              color="blue"
              disabled={!manualHasSingleFile || manualTooManyFiles}
              onClick={handleOpenManualEditor}
            >
              {t("redact.manual.openEditorCta", "Open redaction editor")}
            </Button>
          </Stack>
        ),
      });
    }

    return steps;
  };

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
      minFiles: isManualMode ? 1 : undefined,
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
