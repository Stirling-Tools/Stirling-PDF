import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useFileContext } from "../contexts/FileContext";
import { useToolFileSelection } from "../contexts/FileSelectionContext";

import { createToolFlow } from "../components/tools/shared/createToolFlow";
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
            onBack={() => handleStepChange({ step: 'selection'})}
            onComplete={handleComplete}
          />
        );

      default:
        return <div>{t('automate.invalidStep', 'Invalid step')}</div>;
    }
  };

  return createToolFlow({
    files: {
      selectedFiles: [],
      isCollapsed: hasResults, // Hide files step for automate tool
    },
    steps: [
      {
        title: t('automate.selection.title', 'Automation Selection'),
        isVisible: true,
        isCollapsed: currentStep !== 'selection',
        onCollapsedClick: () => setCurrentStep('selection'),
        content: currentStep === 'selection' ? renderCurrentStep() : null
      },
      {
        title: stepData.mode === AutomationMode.EDIT
          ? t('automate.creation.editTitle', 'Edit Automation')
          : t('automate.creation.createTitle', 'Create Automation'),
        isVisible: currentStep === 'creation',
        isCollapsed: false,
        content: currentStep === 'creation' ? renderCurrentStep() : null
      },
      {
        title: t('automate.run.title', 'Run Automation'),
        isVisible: currentStep === 'run',
        isCollapsed: false,
        content: currentStep === 'run' ? renderCurrentStep() : null
      }
    ],
    review: {
      isVisible: hasResults, // Hide review step for automate tool
      operation: automateOperation,
      title: t('automate.reviewTitle', 'Automation Results')
    }
  });
};

export default Automate;
