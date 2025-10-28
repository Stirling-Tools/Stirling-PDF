import React from 'react';
import { useTranslation } from 'react-i18next';
import { RemoveCertificateSignParameters } from '@app/hooks/tools/removeCertificateSign/useRemoveCertificateSignParameters';

interface RemoveCertificateSignSettingsProps {
  parameters: RemoveCertificateSignParameters;
  onParameterChange: <K extends keyof RemoveCertificateSignParameters>(parameter: K, value: RemoveCertificateSignParameters[K]) => void;
  disabled?: boolean;
}

const RemoveCertificateSignSettings: React.FC<RemoveCertificateSignSettingsProps> = (_) => {
  const { t } = useTranslation();

  return (
    <div className="remove-certificate-sign-settings">
      <p className="text-muted">
        {t('removeCertSign.description', 'This tool will remove digital certificate signatures from your PDF document.')}
      </p>
    </div>
  );
};

export default RemoveCertificateSignSettings;
