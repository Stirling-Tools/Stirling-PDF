import React, { useState } from 'react';
import { Container, Paper, Stepper, Button, Group, Title, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { ModeSelection } from '@app/components/SetupWizard/ModeSelection';
import { ServerSelection } from '@app/components/SetupWizard/ServerSelection';
import { LoginForm } from '@app/components/SetupWizard/LoginForm';
import { connectionModeService, ServerConfig } from '@app/services/connectionModeService';
import { authService } from '@app/services/authService';
import { tauriBackendService } from '@app/services/tauriBackendService';

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
      // Skip directly to completion for offline mode
      handleOfflineSetup();
    } else {
      // Go to server selection
      setActiveStep(SetupStep.ServerSelection);
    }
  };

  const handleOfflineSetup = async () => {
    try {
      setLoading(true);
      setError(null);

      // Set connection mode to offline
      await connectionModeService.switchToOffline();

      // Start the local backend
      await tauriBackendService.startBackend();

      // Complete setup
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

      // Attempt login
      await authService.login(serverConfig.url, username, password);

      // Set connection mode to server
      await connectionModeService.switchToServer(serverConfig);

      // Initialize health monitoring for external server
      await tauriBackendService.initializeExternalBackend();

      // Complete setup
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
      // From login back to server selection
      setActiveStep(SetupStep.ServerSelection);
    } else if (activeStep === SetupStep.ServerSelection) {
      // From server selection back to mode selection
      setActiveStep(SetupStep.ModeSelection);
      setSelectedMode(null);
      setServerConfig(null);
    }
  };

  return (
    <Container size="sm" style={{ marginTop: '4rem' }}>
      <Paper shadow="md" p="xl" radius="md">
        <Title order={1} mb="md">
          {t('setup.welcome', 'Welcome to Stirling PDF')}
        </Title>

        <Text size="sm" c="dimmed" mb="xl">
          {t('setup.description', 'Get started by choosing how you want to use Stirling PDF')}
        </Text>

        <Stepper active={activeStep}>
          <Stepper.Step
            label={t('setup.step1.label', 'Choose Mode')}
            description={t('setup.step1.description', 'Offline or Server')}
          >
            <ModeSelection onSelect={handleModeSelection} loading={loading} />
          </Stepper.Step>

          <Stepper.Step
            label={t('setup.step2.label', 'Select Server')}
            description={t('setup.step2.description', 'Self-hosted server')}
          >
            <ServerSelection onSelect={handleServerSelection} loading={loading} />
          </Stepper.Step>

          <Stepper.Step
            label={t('setup.step3.label', 'Login')}
            description={t('setup.step3.description', 'Enter credentials')}
          >
            <LoginForm
              serverUrl={serverConfig?.url || ''}
              onLogin={handleLogin}
              loading={loading}
            />
          </Stepper.Step>
        </Stepper>

        {error && (
          <Text c="red" size="sm" mt="md">
            {error}
          </Text>
        )}

        {activeStep > SetupStep.ModeSelection && (
          <Group justify="center" mt="xl">
            <Button variant="default" onClick={handleBack} disabled={loading}>
              {t('common.back', 'Back')}
            </Button>
          </Group>
        )}
      </Paper>
    </Container>
  );
};
