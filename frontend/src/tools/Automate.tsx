import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useFileContext } from "../contexts/FileContext";
import { useToolFileSelection } from "../contexts/FileSelectionContext";

import { createToolFlow } from "../components/tools/shared/createToolFlow";
import AutomationSelection from "../components/tools/automate/AutomationSelection";
import AutomationCreation from "../components/tools/automate/AutomationCreation";

import { useAutomateOperation } from "../hooks/tools/automate/useAutomateOperation";
import { BaseToolProps } from "../types/tool";

const Automate = ({ onPreviewFile, onComplete, onError }: BaseToolProps) => {
  const { t } = useTranslation();
  const { setCurrentMode } = useFileContext();
  const { selectedFiles } = useToolFileSelection();

  const [currentStep, setCurrentStep] = useState<'selection' | 'creation'>('selection');
  const [stepData, setStepData] = useState<any>({});

  const automateOperation = useAutomateOperation();

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
            onSelectCustom={() => handleStepChange({ step: 'creation', mode: 'custom' })}
            onSelectSuggested={(automation: any) => handleStepChange({ step: 'creation', mode: 'suggested', automation })}
            onCreateNew={() => handleStepChange({ step: 'creation', mode: 'create' })}
          />
        );

      case 'creation':
        return (
          <AutomationCreation
            mode={stepData.mode}
            existingAutomation={stepData.automation}
            onBack={() => handleStepChange({ step: 'selection' })}
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
        content: renderCurrentStep()
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
