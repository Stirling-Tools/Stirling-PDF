import React from 'react';
import { useTranslation } from 'react-i18next';
import LoginHeader from '@app/routes/login/LoginHeader';
import ErrorMessage from '@app/routes/login/ErrorMessage';
import { ServerSelection } from '@app/components/SetupWizard/ServerSelection';
import { ServerConfig } from '@app/services/connectionModeService';
import '@app/routes/authShared/auth.css';

interface ServerSelectionScreenProps {
  onSelect: (config: ServerConfig) => void;
  loading: boolean;
  error: string | null;
}

export const ServerSelectionScreen: React.FC<ServerSelectionScreenProps> = ({
  onSelect,
  loading,
  error,
}) => {
  const { t } = useTranslation();

  return (
    <>
      <LoginHeader
        title={t('setup.server.title', 'Connect to Server')}
        subtitle={t('setup.server.subtitle', 'Enter your self-hosted server URL')}
      />

      <ErrorMessage error={error} />

      <ServerSelection onSelect={onSelect} loading={loading} />
    </>
  );
};
