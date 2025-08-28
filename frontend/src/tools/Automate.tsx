import React, { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useFileContext } from "../contexts/FileContext";
import { useFileSelection } from "../contexts/FileContext";
import { useNavigationActions } from "../contexts/NavigationContext";
import { useToolWorkflow } from "../contexts/ToolWorkflowContext";

import { createToolFlow } from "../components/tools/shared/createToolFlow";
import { createFilesToolStep } from "../components/tools/shared/FilesToolStep";
import AutomationSelection from "../components/tools/automate/AutomationSelection";
import AutomationCreation from "../components/tools/automate/AutomationCreation";
import AutomationRun from "../components/tools/automate/AutomationRun";

import { useAutomateOperation } from "../hooks/tools/automate/useAutomateOperation";
import { BaseToolProps } from "../types/tool";
import { useFlatToolRegistry } from "../data/useTranslatedToolRegistry";
import { useSavedAutomations } from "../hooks/tools/automate/useSavedAutomations";
import { AutomationConfig, AutomationStepData, AutomationMode, AutomationStep } from "../types/automation";
import { AUTOMATION_STEPS } from "../constants/automation";

const Automate = ({ onPreviewFile, onComplete, onError }: BaseToolProps) => {
  const { t } = useTranslation();
  const { selectedFiles } = useFileSelection();
  const { actions } = useNavigationActions();
  const { registerToolReset } = useToolWorkflow();

  const [currentStep, setCurrentStep] = useState<AutomationStep>(AUTOMATION_STEPS.SELECTION);
  const [stepData, setStepData] = useState<AutomationStepData>({ step: AUTOMATION_STEPS.SELECTION });

  const automateOperation = useAutomateOperation();
  const toolRegistry = useFlatToolRegistry();
  const hasResults = automateOperation.files.length > 0 || automateOperation.downloadUrl !== null;
  const { savedAutomations, deleteAutomation, refreshAutomations, copyFromSuggested } = useSavedAutomations();

  // Use ref to store the latest reset function to avoid closure issues
  const resetFunctionRef = React.useRef<() => void>(null);

  // Update ref with latest reset function
  resetFunctionRef.current = () => {
    automateOperation.resetResults();
    automateOperation.clearError();
    setCurrentStep(AUTOMATION_STEPS.SELECTION);
    setStepData({ step: AUTOMATION_STEPS.SELECTION });
  };

  // Register reset function with the tool workflow context - only once on mount
  React.useEffect(() => {
    const stableResetFunction = () => {
      if (resetFunctionRef.current) {
        resetFunctionRef.current();
      }
    };

    registerToolReset('automate', stableResetFunction);
  }, [registerToolReset]); // Only depend on registerToolReset which should be stable

  const handleStepChange = (data: AutomationStepData) => {
    // If navigating away from run step, reset automation results
    if (currentStep === AUTOMATION_STEPS.RUN && data.step !== AUTOMATION_STEPS.RUN) {
      automateOperation.resetResults();
    }

    // If navigating to selection step, always clear results
    if (data.step === AUTOMATION_STEPS.SELECTION) {
      automateOperation.resetResults();
      automateOperation.clearError();
    }

    // If navigating to run step with a different automation, reset results
    if (data.step === AUTOMATION_STEPS.RUN && data.automation &&
        stepData.automation && data.automation.id !== stepData.automation.id) {
      automateOperation.resetResults();
    }

    setStepData(data);
    setCurrentStep(data.step);
  };

  const handleComplete = () => {
    // Reset automation results when completing
    automateOperation.resetResults();

    // Reset to selection step
    setCurrentStep(AUTOMATION_STEPS.SELECTION);
    setStepData({ step: AUTOMATION_STEPS.SELECTION });
    onComplete?.([]); // Pass empty array since automation creation doesn't produce files
  };

  const renderCurrentStep = () => {
    switch (currentStep) {
      case AUTOMATION_STEPS.SELECTION:
        return (
          <AutomationSelection
            savedAutomations={savedAutomations}
            onCreateNew={() => handleStepChange({ step: AUTOMATION_STEPS.CREATION, mode: AutomationMode.CREATE })}
            onRun={(automation: AutomationConfig) => handleStepChange({ step: AUTOMATION_STEPS.RUN, automation })}
            onEdit={(automation: AutomationConfig) => handleStepChange({ step: AUTOMATION_STEPS.CREATION, mode: AutomationMode.EDIT, automation })}
            onDelete={async (automation: AutomationConfig) => {
              try {
                await deleteAutomation(automation.id);
              } catch (error) {
                console.error('Failed to delete automation:', error);
                onError?.(`Failed to delete automation: ${automation.name}`);
              }
            }}
            onCopyFromSuggested={async (suggestedAutomation) => {
              try {
                await copyFromSuggested(suggestedAutomation);
              } catch (error) {
                console.error('Failed to copy suggested automation:', error);
                onError?.(`Failed to copy automation: ${suggestedAutomation.name}`);
              }
            }}
            toolRegistry={toolRegistry}
          />
        );

      case AUTOMATION_STEPS.CREATION:
        if (!stepData.mode) {
          console.error('Creation mode is undefined');
          return null;
        }
        return (
          <AutomationCreation
            mode={stepData.mode}
            existingAutomation={stepData.automation}
            onBack={() => handleStepChange({ step: AUTOMATION_STEPS.SELECTION })}
            onComplete={() => {
              refreshAutomations();
              handleStepChange({ step: AUTOMATION_STEPS.SELECTION });
            }}
            toolRegistry={toolRegistry}
          />
        );

      case AUTOMATION_STEPS.RUN:
        if (!stepData.automation) {
          console.error('Automation config is undefined');
          return null;
        }
        return (
          <AutomationRun
            automation={stepData.automation}
            onComplete={handleComplete}
            automateOperation={automateOperation}
          />
        );

      default:
        return <div>{t('automate.invalidStep', 'Invalid step')}</div>;
    }
  };

  const createStep = (title: string, props: any, content?: React.ReactNode) => ({
    title,
    ...props,
    content
  });

  // Dynamic file placeholder based on supported types
  const filesPlaceholder = useMemo(() => {
    if (currentStep === AUTOMATION_STEPS.RUN && stepData.automation?.operations?.length) {
      const firstOperation = stepData.automation.operations[0];
      const toolConfig = toolRegistry[firstOperation.operation as keyof typeof toolRegistry];

      // Check if the tool has supportedFormats that include non-PDF formats
      if (toolConfig?.supportedFormats && toolConfig.supportedFormats.length > 1) {
        return t('automate.files.placeholder.multiFormat', 'Select files to process (supports various formats)');
      }
    }
    return t('automate.files.placeholder', 'Select PDF files to process with this automation');
  }, [currentStep, stepData.automation, toolRegistry, t]);

  // Always create files step to avoid conditional hook calls
  const filesStep = createFilesToolStep(createStep, {
    selectedFiles,
    isCollapsed: hasResults,
    placeholder: filesPlaceholder
  });

  const automationSteps = [
    createStep(t('automate.selection.title', 'Automation Selection'), {
      isVisible: true,
      isCollapsed: currentStep !== AUTOMATION_STEPS.SELECTION,
      onCollapsedClick: () => {
        // Clear results when clicking back to selection
        automateOperation.resetResults();
        setCurrentStep(AUTOMATION_STEPS.SELECTION);
        setStepData({ step: AUTOMATION_STEPS.SELECTION });
      }
    }, currentStep === AUTOMATION_STEPS.SELECTION ? renderCurrentStep() : null),

    createStep(stepData.mode === AutomationMode.EDIT
      ? t('automate.creation.editTitle', 'Edit Automation')
      : t('automate.creation.createTitle', 'Create Automation'), {
      isVisible: currentStep === AUTOMATION_STEPS.CREATION,
      isCollapsed: false
    }, currentStep === AUTOMATION_STEPS.CREATION ? renderCurrentStep() : null),

    // Files step - only visible during run mode
    {
      ...filesStep,
      isVisible: currentStep === AUTOMATION_STEPS.RUN
    },

    // Run step
    createStep(t('automate.run.title', 'Run Automation'), {
      isVisible: currentStep === AUTOMATION_STEPS.RUN,
      isCollapsed: hasResults,
    }, currentStep === AUTOMATION_STEPS.RUN ? renderCurrentStep() : null)
  ];

  return createToolFlow({
    files: {
      selectedFiles: currentStep === AUTOMATION_STEPS.RUN ? selectedFiles : [],
      isCollapsed: currentStep !== AUTOMATION_STEPS.RUN || hasResults,
      isVisible: false, // Hide the default files step since we add our own
    },
    steps: automationSteps,
    review: {
      isVisible: hasResults && currentStep === AUTOMATION_STEPS.RUN,
      operation: automateOperation,
      title: t('automate.reviewTitle', 'Automation Results'),
      onFileClick: (file: File) => {
        onPreviewFile?.(file);
        actions.setWorkbench('viewer');
      }
    }
  });
};

export default Automate;
