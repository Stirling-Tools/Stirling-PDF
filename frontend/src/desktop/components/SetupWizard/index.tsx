import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DesktopAuthLayout } from '@app/components/SetupWizard/DesktopAuthLayout';
import { SaaSLoginScreen } from '@app/components/SetupWizard/SaaSLoginScreen';
import { ServerSelectionScreen } from '@app/components/SetupWizard/ServerSelectionScreen';
import { SelfHostedLoginScreen } from '@app/components/SetupWizard/SelfHostedLoginScreen';
import { ServerConfig, connectionModeService } from '@app/services/connectionModeService';
import { authService, UserInfo } from '@app/services/authService';
import { tauriBackendService } from '@app/services/tauriBackendService';
import { STIRLING_SAAS_URL } from '@desktop/constants/connection';
import '@app/routes/authShared/auth.css';

enum SetupStep {
  SaaSLogin,
  ServerSelection,
  SelfHostedLogin,
}

interface SetupWizardProps {
  onComplete: () => void;
}

export const SetupWizard: React.FC<SetupWizardProps> = ({ onComplete }) => {
  const { t } = useTranslation();
  const [activeStep, setActiveStep] = useState<SetupStep>(SetupStep.SaaSLogin);
  const [serverConfig, setServerConfig] = useState<ServerConfig | null>({ url: STIRLING_SAAS_URL });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSaaSLogin = async (username: string, password: string) => {
    if (!serverConfig) {
      setError('No SaaS server configured');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Only attempt password login if a password is provided
      // If password is empty, assume OAuth login already completed
      const isAlreadyAuthenticated = await authService.isAuthenticated();
      if (!isAlreadyAuthenticated && password) {
        await authService.login(serverConfig.url, username, password);
      }

      await connectionModeService.switchToSaaS(serverConfig.url);
      tauriBackendService.startBackend().catch(console.error);
      onComplete();
    } catch (err) {
      console.error('SaaS login failed:', err);
      setError(err instanceof Error ? err.message : 'SaaS login failed');
      setLoading(false);
    }
  };

  const handleSaaSLoginOAuth = async (_userInfo: UserInfo) => {
    if (!serverConfig) {
      setError('No SaaS server configured');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // OAuth already completed by authService.loginWithOAuth
      await connectionModeService.switchToSaaS(serverConfig.url);
      tauriBackendService.startBackend().catch(console.error);
      onComplete();
    } catch (err) {
      console.error('SaaS OAuth login completion failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to complete SaaS login');
      setLoading(false);
    }
  };

  const handleSelfHostedClick = () => {
    setError(null);
    setActiveStep(SetupStep.ServerSelection);
  };

  const handleServerSelection = (config: ServerConfig) => {
    setServerConfig(config);
    setError(null);
    setActiveStep(SetupStep.SelfHostedLogin);
  };

  const handleSelfHostedLogin = async (username: string, password: string) => {
    if (!serverConfig) {
      setError('No server configured');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      await authService.login(serverConfig.url, username, password);
      await connectionModeService.switchToSelfHosted(serverConfig);
      await tauriBackendService.initializeExternalBackend();
      onComplete();
    } catch (err) {
      console.error('Self-hosted login failed:', err);
      setError(err instanceof Error ? err.message : 'Self-hosted login failed');
      setLoading(false);
    }
  };

  const handleBack = () => {
    setError(null);
    if (activeStep === SetupStep.SelfHostedLogin) {
      setActiveStep(SetupStep.ServerSelection);
    } else if (activeStep === SetupStep.ServerSelection) {
      setActiveStep(SetupStep.SaaSLogin);
      setServerConfig({ url: STIRLING_SAAS_URL });
    }
  };

  return (
    <DesktopAuthLayout>
      {/* Step Content */}
      {activeStep === SetupStep.SaaSLogin && (
        <SaaSLoginScreen
          serverUrl={serverConfig?.url || STIRLING_SAAS_URL}
          onLogin={handleSaaSLogin}
          onOAuthSuccess={handleSaaSLoginOAuth}
          onSelfHostedClick={handleSelfHostedClick}
          loading={loading}
          error={error}
        />
      )}

      {activeStep === SetupStep.ServerSelection && (
        <ServerSelectionScreen
          onSelect={handleServerSelection}
          loading={loading}
          error={error}
        />
      )}

      {activeStep === SetupStep.SelfHostedLogin && (
        <SelfHostedLoginScreen
          serverUrl={serverConfig?.url || ''}
          onLogin={handleSelfHostedLogin}
          loading={loading}
          error={error}
        />
      )}

      {/* Back Button */}
      {activeStep > SetupStep.SaaSLogin && !loading && (
        <div className="navigation-link-container" style={{ marginTop: '1.5rem' }}>
          <button
            type="button"
            onClick={handleBack}
            className="navigation-link-button"
          >
            {t('common.back', 'Back')}
          </button>
        </div>
      )}
    </DesktopAuthLayout>
  );
};
