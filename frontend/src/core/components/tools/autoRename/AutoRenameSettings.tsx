import React from 'react';
import { useTranslation } from 'react-i18next';
import { AutoRenameParameters } from '@app/hooks/tools/autoRename/useAutoRenameParameters';

interface AutoRenameSettingsProps {
  parameters: AutoRenameParameters;
  onParameterChange: <K extends keyof AutoRenameParameters>(parameter: K, value: AutoRenameParameters[K]) => void;
  disabled?: boolean;
}

const AutoRenameSettings: React.FC<AutoRenameSettingsProps> = (
  ) => {
  const { t } = useTranslation();

  return (
    <div className="auto-rename-settings">
      <p className="text-muted">
        {t('autoRename.description', 'This tool will automatically rename PDF files based on their content. It analyzes the document to find the most suitable title from the text.')}
      </p>
    </div>
  );
};

export default AutoRenameSettings;
