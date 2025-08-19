import React from 'react';
import { useTranslation } from 'react-i18next';
import { UnlockPdfFormsParameters } from '../../../hooks/tools/unlockPdfForms/useUnlockPdfFormsParameters';

interface UnlockPdfFormsSettingsProps {
  parameters: UnlockPdfFormsParameters;
  onParameterChange: <K extends keyof UnlockPdfFormsParameters>(parameter: K, value: UnlockPdfFormsParameters[K]) => void;
  disabled?: boolean;
}

const UnlockPdfFormsSettings: React.FC<UnlockPdfFormsSettingsProps> = ({ 
  parameters, 
  onParameterChange, // Unused - kept for interface consistency and future extensibility
  disabled = false 
}) => {
  const { t } = useTranslation();

  return (
    <div className="unlock-pdf-forms-settings">
      <p className="text-muted">
        {t('unlockPDFForms.description', 'This tool will remove read-only restrictions from PDF form fields, making them editable and fillable.')}
      </p>
    </div>
  );
};

export default UnlockPdfFormsSettings;