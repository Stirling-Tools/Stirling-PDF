import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFileSelection } from "@app/contexts/FileContext";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import { BaseToolProps, ToolComponent } from "@app/types/tool";
import { useEndpointEnabled } from "@app/hooks/useEndpointConfig";
import { useAddStampParameters } from "@app/components/tools/addStamp/useAddStampParameters";
import { useAddStampOperation } from "@app/components/tools/addStamp/useAddStampOperation";
import { Stack, Text } from "@mantine/core";
import StampPreview from "@app/components/tools/addStamp/StampPreview";
import styles from "@app/components/tools/addStamp/StampPreview.module.css";
import ButtonSelector from "@app/components/shared/ButtonSelector";
import { useAccordionSteps } from "@app/hooks/tools/shared/useAccordionSteps";
import ObscuredOverlay from "@app/components/shared/ObscuredOverlay";
import StampSetupSettings from "@app/components/tools/addStamp/StampSetupSettings";
import StampPositionFormattingSettings from "@app/components/tools/addStamp/StampPositionFormattingSettings";
import { useAddStampSetupTips, useAddStampPositionTips } from "@app/components/tooltips/useAddStampTips";

const AddStamp = ({ onPreviewFile, onComplete, onError }: BaseToolProps) => {
  const { t } = useTranslation();
  const { selectedFiles } = useFileSelection();

  const [quickPositionModeSelected, setQuickPositionModeSelected] = useState(false);
  const [customPositionModeSelected, setCustomPositionModeSelected] = useState(true);

  const params = useAddStampParameters();
  const operation = useAddStampOperation();
  const stampSetupTips = useAddStampSetupTips();
  const stampPositionTips = useAddStampPositionTips();

  const { enabled: endpointEnabled, loading: endpointLoading } = useEndpointEnabled("add-stamp");

  useEffect(() => {
    operation.resetResults();
    onPreviewFile?.(null);
  }, [params.parameters]);


  const handleExecute = async () => {
    try {
      await operation.executeOperation(params.parameters, selectedFiles);
      if (operation.files && onComplete) {
        onComplete(operation.files);
      }
    } catch (error: any) {
      onError?.(error?.message || t("AddStampRequest.error.failed", "Add stamp operation failed"));
    }
  };

  const hasFiles = selectedFiles.length > 0;
  const hasResults = operation.files.length > 0 || operation.downloadUrl !== null;

  enum AddStampStep {
    NONE = 'none',
    STAMP_SETUP = 'stampSetup',
    POSITION_FORMATTING = 'positionFormatting'
  }

  const accordion = useAccordionSteps<AddStampStep>({
    noneValue: AddStampStep.NONE,
    initialStep: AddStampStep.STAMP_SETUP,
    stateConditions: {
      hasFiles,
      hasResults
    },
    afterResults: () => {
      operation.resetResults();
      onPreviewFile?.(null);
    }
  });

  const getSteps = () => {
    const steps: any[] = [];

    // Step 1: Stamp Setup
    steps.push({
      title: t("AddStampRequest.stampSetup", "Stamp Setup"),
      isCollapsed: accordion.getCollapsedState(AddStampStep.STAMP_SETUP),
      onCollapsedClick: () => accordion.handleStepToggle(AddStampStep.STAMP_SETUP),
      isVisible: hasFiles || hasResults,
      tooltip: stampSetupTips,
      content: (
        <StampSetupSettings
          parameters={params.parameters}
          onParameterChange={params.updateParameter}
          disabled={endpointLoading}
        />
      ),
    });

    // Step 2: Formatting & Position
    steps.push({
      title: t("AddStampRequest.positionAndFormatting", "Position & Formatting"),
      isCollapsed: accordion.getCollapsedState(AddStampStep.POSITION_FORMATTING),
      onCollapsedClick: () => accordion.handleStepToggle(AddStampStep.POSITION_FORMATTING),
      isVisible: hasFiles || hasResults,
      tooltip: stampPositionTips,
      content: (
        <Stack gap="md" justify="space-between">
          {/* Mode toggle: Quick grid vs Custom drag - only show for image stamps */}
          {params.parameters.stampType === 'image' && (
            <ButtonSelector
              value={quickPositionModeSelected ? 'quick' : 'custom'}
              onChange={(v: 'quick' | 'custom') => {
                const isQuick = v === 'quick';
                setQuickPositionModeSelected(isQuick);
                setCustomPositionModeSelected(!isQuick);
              }}
              options={[
                { value: 'quick', label: t('quickPosition', 'Quick Position') },
                { value: 'custom', label: t('customPosition', 'Custom Position') },
              ]}
              disabled={endpointLoading}
              buttonClassName={styles.modeToggleButton}
              textClassName={styles.modeToggleButtonText}
            />
          )}

          {params.parameters.stampType === 'image' && customPositionModeSelected && (
            <div className={styles.informationContainer}>
              <Text className={styles.informationText}>{t('AddStampRequest.customPosition', 'Drag the stamp to the desired location in the preview window.')}</Text>
            </div>
          )}
          {params.parameters.stampType === 'image' && !customPositionModeSelected && (
            <div className={styles.informationContainer}>
              <Text className={styles.informationText}>{t('AddStampRequest.quickPosition', 'Select a position on the page to place the stamp.')}</Text>
            </div>
          )}

          <StampPositionFormattingSettings
            parameters={params.parameters}
            onParameterChange={params.updateParameter}
            disabled={endpointLoading}
          />

          {/* Unified preview wrapped with obscured overlay if no stamp selected */}
          <ObscuredOverlay
            obscured={
              accordion.currentStep === AddStampStep.POSITION_FORMATTING &&
              ((params.parameters.stampType === 'text' && params.parameters.stampText.trim().length === 0) ||
               (params.parameters.stampType === 'image' && !params.parameters.stampImage))
            }
            overlayMessage={
              <Text size="sm" c="white" fw={600}>
                {t('AddStampRequest.noStampSelected', 'No stamp selected. Return to Step 1.')}
              </Text>
            }
          >
            <StampPreview
              parameters={params.parameters}
              onParameterChange={params.updateParameter}
              file={selectedFiles[0] || null}
              showQuickGrid={params.parameters.stampType === 'text' ? true : quickPositionModeSelected}
            />
          </ObscuredOverlay>
        </Stack>
      ),
    });

    return steps;
  };

  return createToolFlow({
    files: {
      selectedFiles,
      isCollapsed: hasResults,
    },
    steps: getSteps(),
    executeButton: {
      text: t('AddStampRequest.submit', 'Add Stamp'),
      isVisible: !hasResults,
      loadingText: t('loading'),
      onClick: handleExecute,
      disabled: !params.validateParameters() || !hasFiles || !endpointEnabled,
    },
    review: {
      isVisible: hasResults,
      operation: operation,
      title: t('AddStampRequest.results.title', 'Stamp Results'),
      onFileClick: (file) => onPreviewFile?.(file),
      onUndo: async () => {
        await operation.undoOperation();
        onPreviewFile?.(null);
      },
    },
  });
};

AddStamp.tool = () => useAddStampOperation;

export default AddStamp as ToolComponent;


