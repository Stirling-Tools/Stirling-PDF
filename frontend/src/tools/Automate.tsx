import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useFileSelection } from "../contexts/FileContext";
import { useNavigationActions } from "../contexts/NavigationContext";
import { useToolWorkflow } from "../contexts/ToolWorkflowContext";

import { createToolFlow, MiddleStepConfig } from "../components/tools/shared/createToolFlow";
import { createFilesToolStep } from "../components/tools/shared/FilesToolStep";
import AutomationSelection from "../components/tools/automate/AutomationSelection";
import AutomationCreation from "../components/tools/automate/AutomationCreation";
import AutomationRun from "../components/tools/automate/AutomationRun";

import { useAutomateOperation } from "../hooks/tools/automate/useAutomateOperation";
import { BaseToolProps } from "../types/tool";
import { useFlatToolRegistry } from "../data/useTranslatedToolRegistry";
import { useSavedAutomations } from "../hooks/tools/automate/useSavedAutomations";
import { AutomationConfig, AutomationStepData, AutomationMode, AutomationStep, AutomateParameters } from "../types/automation";
import { AUTOMATION_STEPS } from "../constants/automation";
import { StirlingFile } from "src/types/fileContext";

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

  const handleUndo = async () => {
    await automateOperation.undoOperation();
    onPreviewFile?.(null);
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
            automateOperation={{
              ...automateOperation,
              executeOperation: async (params, files) => {
                const stirlingFiles = files as StirlingFile[]; // Ensure type compatibility
                await automateOperation.executeOperation(params as AutomateParameters, stirlingFiles);
              }
            }}
          />
        );

      default:
        return <div>{t('automate.invalidStep', 'Invalid step')}</div>;
    }
  };

  const createStep = (title: string, props: Record<string, unknown>, content?: React.ReactNode): React.ReactElement => {
    return (
      <div {...props}>
        <h3>{title}</h3>
        {content}
      </div>
    );
  };

  // Always create files step to avoid conditional hook calls
  const filesStep = createFilesToolStep(createStep, {
    selectedFiles,
    isCollapsed: hasResults,
  });

  const automationSteps: MiddleStepConfig[] = [
    {
      title: t('automate.selection.title', 'Automation Selection'),
      content: currentStep === AUTOMATION_STEPS.SELECTION ? renderCurrentStep() : null,
      isVisible: true,
      isCollapsed: currentStep !== AUTOMATION_STEPS.SELECTION,
      onCollapsedClick: () => {
        // Clear results when clicking back to selection
        automateOperation.resetResults();
        setCurrentStep(AUTOMATION_STEPS.SELECTION);
        setStepData({ step: AUTOMATION_STEPS.SELECTION });
      }
    },
    {
      title: stepData.mode === AutomationMode.EDIT
        ? t('automate.creation.editTitle', 'Edit Automation')
        : t('automate.creation.createTitle', 'Create Automation'),
      content: currentStep === AUTOMATION_STEPS.CREATION ? renderCurrentStep() : null,
      isVisible: currentStep === AUTOMATION_STEPS.CREATION,
      isCollapsed: false
    },
    {
      ...filesStep,
      title: t('automate.files.title', 'Files'),
      content: null, // Files step content is managed separately
      isVisible: currentStep === AUTOMATION_STEPS.RUN
    },
    {
      title: t('automate.run.title', 'Run Automation'),
      content: currentStep === AUTOMATION_STEPS.RUN ? renderCurrentStep() : null,
      isVisible: currentStep === AUTOMATION_STEPS.RUN,
      isCollapsed: hasResults
    }
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
      },
      onUndo: () => {
        handleUndo().catch((error) => {
          console.error('Undo operation failed:', error);
        });
      }
    }
  });
};

export default Automate;
