import React, { useState } from 'react';
import { Container, Paper, Stack, Title, Text, Button, Image } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { ModeSelection } from '@app/components/SetupWizard/ModeSelection';
import { ServerSelection } from '@app/components/SetupWizard/ServerSelection';
import { LoginForm } from '@app/components/SetupWizard/LoginForm';
import { connectionModeService, ServerConfig } from '@app/services/connectionModeService';
import { authService } from '@app/services/authService';
import { tauriBackendService } from '@app/services/tauriBackendService';
import { BASE_PATH } from '@app/constants/app';
import '@app/components/SetupWizard/SetupWizard.css';

enum SetupStep {
  ModeSelection,
  ServerSelection,
  Login,
}

interface SetupWizardProps {
  onComplete: () => void;
}

export const SetupWizard: React.FC<SetupWizardProps> = ({ onComplete }) => {
  const { t } = useTranslation();
  const [activeStep, setActiveStep] = useState<SetupStep>(SetupStep.ModeSelection);
  const [_selectedMode, setSelectedMode] = useState<'offline' | 'server' | null>(null);
  const [serverConfig, setServerConfig] = useState<ServerConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleModeSelection = (mode: 'offline' | 'server') => {
    setSelectedMode(mode);
    setError(null);

    if (mode === 'offline') {
      handleOfflineSetup();
    } else {
      setActiveStep(SetupStep.ServerSelection);
    }
  };

  const handleOfflineSetup = async () => {
    try {
      setLoading(true);
      setError(null);

      await connectionModeService.switchToOffline();
      await tauriBackendService.startBackend();
      onComplete();
    } catch (err) {
      console.error('Failed to set up offline mode:', err);
      setError(err instanceof Error ? err.message : 'Failed to set up offline mode');
      setLoading(false);
    }
  };

  const handleServerSelection = (config: ServerConfig) => {
    setServerConfig(config);
    setError(null);
    setActiveStep(SetupStep.Login);
  };

  const handleLogin = async (username: string, password: string) => {
    if (!serverConfig) {
      setError('No server configured');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      await authService.login(serverConfig.url, username, password);
      await connectionModeService.switchToServer(serverConfig);
      await tauriBackendService.initializeExternalBackend();
      onComplete();
    } catch (err) {
      console.error('Login failed:', err);
      setError(err instanceof Error ? err.message : 'Login failed');
      setLoading(false);
    }
  };

  const handleBack = () => {
    setError(null);
    if (activeStep === SetupStep.Login) {
      setActiveStep(SetupStep.ServerSelection);
    } else if (activeStep === SetupStep.ServerSelection) {
      setActiveStep(SetupStep.ModeSelection);
      setSelectedMode(null);
      setServerConfig(null);
    }
  };

  const getStepTitle = () => {
    switch (activeStep) {
      case SetupStep.ModeSelection:
        return t('setup.welcome', 'Welcome to Stirling PDF');
      case SetupStep.ServerSelection:
        return t('setup.server.title', 'Connect to Server');
      case SetupStep.Login:
        return t('setup.login.title', 'Sign In');
      default:
        return '';
    }
  };

  const getStepSubtitle = () => {
    switch (activeStep) {
      case SetupStep.ModeSelection:
        return t('setup.description', 'Get started by choosing how you want to use Stirling PDF');
      case SetupStep.ServerSelection:
        return t('setup.server.subtitle', 'Enter your self-hosted server URL');
      case SetupStep.Login:
        return t('setup.login.subtitle', 'Enter your credentials to continue');
      default:
        return '';
    }
  };

  return (
    <div className="setup-container">
      <Container size="sm" className="setup-wrapper">
        <Paper shadow="xl" p="xl" radius="lg" className="setup-card">
          <Stack gap="lg">
            {/* Logo Header */}
            <Stack gap="xs" align="center">
              <Image
                src={`${BASE_PATH}/branding/StirlingPDFLogoBlackText.svg`}
                alt="Stirling PDF"
                h={32}
                fit="contain"
              />
              <Title order={1} ta="center" style={{ fontSize: '2rem', fontWeight: 800 }}>
                {getStepTitle()}
              </Title>
              <Text size="sm" c="dimmed" ta="center">
                {getStepSubtitle()}
              </Text>
            </Stack>

            {/* Error Message */}
            {error && (
              <Paper p="md" bg="red.0" style={{ border: '1px solid var(--mantine-color-red-3)' }}>
                <Text size="sm" c="red.7" ta="center">
                  {error}
                </Text>
              </Paper>
            )}

            {/* Step Content */}
            {activeStep === SetupStep.ModeSelection && (
              <ModeSelection onSelect={handleModeSelection} loading={loading} />
            )}

            {activeStep === SetupStep.ServerSelection && (
              <ServerSelection onSelect={handleServerSelection} loading={loading} />
            )}

            {activeStep === SetupStep.Login && (
              <LoginForm
                serverUrl={serverConfig?.url || ''}
                onLogin={handleLogin}
                loading={loading}
              />
            )}

            {/* Back Button */}
            {activeStep > SetupStep.ModeSelection && !loading && (
              <Button
                variant="subtle"
                onClick={handleBack}
                fullWidth
                mt="md"
              >
                {t('common.back', 'Back')}
              </Button>
            )}
          </Stack>
        </Paper>
      </Container>
    </div>
  );
};
