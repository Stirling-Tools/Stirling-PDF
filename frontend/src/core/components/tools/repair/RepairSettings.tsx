import React from 'react';
import { useTranslation } from 'react-i18next';
import { RepairParameters } from '@app/hooks/tools/repair/useRepairParameters';

interface RepairSettingsProps {
  parameters: RepairParameters;
  onParameterChange: <K extends keyof RepairParameters>(parameter: K, value: RepairParameters[K]) => void;
  disabled?: boolean;
}

const RepairSettings: React.FC<RepairSettingsProps> = (_) => {
  const { t } = useTranslation();

  return (
    <div className="repair-settings">
      <p className="text-muted">
        {t('repair.description', 'This tool will attempt to repair corrupted or damaged PDF files. No additional settings are required.')}
      </p>
    </div>
  );
};

export default RepairSettings;
