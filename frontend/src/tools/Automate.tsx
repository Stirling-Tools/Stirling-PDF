import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useFileContext } from "../contexts/FileContext";
import { useToolFileSelection } from "../contexts/FileSelectionContext";

import { createToolFlow } from "../components/tools/shared/createToolFlow";
import AutomationSelection from "../components/tools/automate/AutomationSelection";
import AutomationCreation, { AutomationMode } from "../components/tools/automate/AutomationCreation";
import ToolSequence from "../components/tools/automate/ToolSequence";

import { useAutomateOperation } from "../hooks/tools/automate/useAutomateOperation";
import { BaseToolProps } from "../types/tool";
import { useFlatToolRegistry } from "../data/useTranslatedToolRegistry";
import { useSavedAutomations } from "../hooks/tools/automate/useSavedAutomations";

const Automate = ({ onPreviewFile, onComplete, onError }: BaseToolProps) => {
  const { t } = useTranslation();
  const { setCurrentMode } = useFileContext();
  const { selectedFiles } = useToolFileSelection();

  const [currentStep, setCurrentStep] = useState<'selection' | 'creation' | 'sequence'>('selection');
  const [stepData, setStepData] = useState<any>({});

  const automateOperation = useAutomateOperation();
  const toolRegistry = useFlatToolRegistry();
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
            onRun={(automation: any) => handleStepChange({ step: 'sequence', automation })}
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
            onComplete={(automation: any) => handleStepChange({ step: 'sequence', automation })}
            toolRegistry={toolRegistry}
          />
        );

      case 'sequence':
        return (
          <ToolSequence
            automation={stepData.automation}
            onBack={() => handleStepChange({ step: 'creation', mode: stepData.mode, automation: stepData.automation })}
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
      isCollapsed: true, // Hide files step for automate tool
      placeholder: t('automate.filesHidden', 'Files will be selected during automation execution')
    },
    steps: [
      {
        title: t('automate.stepTitle', 'Automations'),
        isVisible: true,
        onCollapsedClick: ()=> setCurrentStep('selection'),
        content: currentStep === 'selection' ? renderCurrentStep() : null
      },
      {
        title: t('automate.sequenceTitle', 'Tool Sequence'),
        isVisible: currentStep === 'creation' || currentStep === 'sequence',
        content: currentStep === 'creation' || currentStep === 'sequence' ? renderCurrentStep() : null
      }
    ],
    review: {
      isVisible: false, // Hide review step for automate tool
      operation: automateOperation,
      title: t('automate.reviewTitle', 'Automation Results')
    }
  });
};

export default Automate;
