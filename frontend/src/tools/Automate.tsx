import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useFileContext } from "../contexts/FileContext";
import { useToolFileSelection } from "../contexts/FileSelectionContext";

import { createToolFlow } from "../components/tools/shared/createToolFlow";
import { createFilesToolStep } from "../components/tools/shared/FilesToolStep";
import AutomationSelection from "../components/tools/automate/AutomationSelection";
import AutomationCreation, { AutomationMode } from "../components/tools/automate/AutomationCreation";
import AutomationRun from "../components/tools/automate/AutomationRun";

import { useAutomateOperation } from "../hooks/tools/automate/useAutomateOperation";
import { BaseToolProps } from "../types/tool";
import { useFlatToolRegistry } from "../data/useTranslatedToolRegistry";
import { useSavedAutomations } from "../hooks/tools/automate/useSavedAutomations";

const Automate = ({ onPreviewFile, onComplete, onError }: BaseToolProps) => {
  const { t } = useTranslation();
  const { setCurrentMode } = useFileContext();
  const { selectedFiles } = useToolFileSelection();

  const [currentStep, setCurrentStep] = useState<'selection' | 'creation' | 'run'>('selection');
  const [stepData, setStepData] = useState<any>({});

  const automateOperation = useAutomateOperation();
  const toolRegistry = useFlatToolRegistry();
  const hasResults = automateOperation.files.length > 0 || automateOperation.downloadUrl !== null;
  const { savedAutomations, deleteAutomation } = useSavedAutomations();

  const handleStepChange = (data: any) => {
    setStepData(data);
    setCurrentStep(data.step);
  };

  const handleComplete = () => {
    // Reset to selection step
    setCurrentStep('selection');
    setStepData({});
    onComplete?.([]); // Pass empty array since automation creation doesn't produce files
  };

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 'selection':
        return (
          <AutomationSelection
            savedAutomations={savedAutomations}
            onCreateNew={() => handleStepChange({ step: 'creation', mode: AutomationMode.CREATE })}
            onRun={(automation: any) => handleStepChange({ step: 'run', automation })}
            onEdit={(automation: any) => handleStepChange({ step: 'creation', mode: AutomationMode.EDIT, automation })}
            onDelete={async (automation: any) => {
              try {
                await deleteAutomation(automation.id);
              } catch (error) {
                console.error('Failed to delete automation:', error);
                onError?.(`Failed to delete automation: ${automation.name}`);
              }
            }}
          />
        );

      case 'creation':
        return (
          <AutomationCreation
            mode={stepData.mode}
            existingAutomation={stepData.automation}
            onBack={() => handleStepChange({ step: 'selection' })}
            onComplete={() => handleStepChange({ step: 'selection' })}
            toolRegistry={toolRegistry}
          />
        );

      case 'run':
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

  // Always create files step to avoid conditional hook calls
  const filesStep = createFilesToolStep(createStep, {
    selectedFiles,
    isCollapsed: hasResults,
    placeholder: t('automate.files.placeholder', 'Select files to process with this automation')
  });

  const automationSteps = [
    createStep(t('automate.selection.title', 'Automation Selection'), {
      isVisible: true,
      isCollapsed: currentStep !== 'selection',
      onCollapsedClick: () => setCurrentStep('selection')
    }, currentStep === 'selection' ? renderCurrentStep() : null),

    createStep(stepData.mode === AutomationMode.EDIT
      ? t('automate.creation.editTitle', 'Edit Automation')
      : t('automate.creation.createTitle', 'Create Automation'), {
      isVisible: currentStep === 'creation',
      isCollapsed: false
    }, currentStep === 'creation' ? renderCurrentStep() : null),

    // Files step - only visible during run mode
    {
      ...filesStep,
      isVisible: currentStep === 'run'
    },

    // Run step
    createStep(t('automate.run.title', 'Run Automation'), {
      isVisible: currentStep === 'run',
      isCollapsed: hasResults,
    }, currentStep === 'run' ? renderCurrentStep() : null)
  ];

  return createToolFlow({
    files: {
      selectedFiles: currentStep === 'run' ? selectedFiles : [],
      isCollapsed: currentStep !== 'run' || hasResults,
      isVisible: false, // Hide the default files step since we add our own
    },
    steps: automationSteps,
    review: {
      isVisible: hasResults,
      operation: automateOperation,
      title: t('automate.reviewTitle', 'Automation Results')
    }
  });
};

export default Automate;
