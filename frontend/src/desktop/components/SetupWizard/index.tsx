import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DesktopAuthLayout } from '@app/components/SetupWizard/DesktopAuthLayout';
import { SaaSLoginScreen } from '@app/components/SetupWizard/SaaSLoginScreen';
import { SaaSSignupScreen } from '@app/components/SetupWizard/SaaSSignupScreen';
import { ServerSelectionScreen } from '@app/components/SetupWizard/ServerSelectionScreen';
import { SelfHostedLoginScreen } from '@app/components/SetupWizard/SelfHostedLoginScreen';
import { ServerConfig, connectionModeService } from '@app/services/connectionModeService';
import { authService, UserInfo } from '@app/services/authService';
import { tauriBackendService } from '@app/services/tauriBackendService';
import { STIRLING_SAAS_URL } from '@desktop/constants/connection';
import { listen } from '@tauri-apps/api/event';
import { useEffect } from 'react';
import '@app/routes/authShared/auth.css';

enum SetupStep {
  SaaSLogin,
  SaaSSignup,
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

  const handleSwitchToSignup = () => {
    setError(null);
    setActiveStep(SetupStep.SaaSSignup);
  };

  const handleSwitchToLogin = () => {
    setError(null);
    setActiveStep(SetupStep.SaaSLogin);
  };

  const handleServerSelection = (config: ServerConfig) => {
    setServerConfig(config);
    setError(null);
    setActiveStep(SetupStep.SelfHostedLogin);
  };

  const handleSelfHostedLogin = async (username: string, password: string) => {
    console.log('[SetupWizard] 🔐 Starting self-hosted login');
    console.log(`[SetupWizard] Server: ${serverConfig?.url}`);
    console.log(`[SetupWizard] Username: ${username}`);

    if (!serverConfig) {
      console.error('[SetupWizard] ❌ No server configured');
      setError('No server configured');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      console.log('[SetupWizard] Step 1: Authenticating with server...');
      await authService.login(serverConfig.url, username, password);
      console.log('[SetupWizard] ✅ Authentication successful');

      console.log('[SetupWizard] Step 2: Switching to self-hosted mode...');
      await connectionModeService.switchToSelfHosted(serverConfig);
      console.log('[SetupWizard] ✅ Switched to self-hosted mode');

      console.log('[SetupWizard] Step 3: Initializing external backend...');
      await tauriBackendService.initializeExternalBackend();
      console.log('[SetupWizard] ✅ External backend initialized');

      console.log('[SetupWizard] ✅ Setup complete, calling onComplete()');
      onComplete();
    } catch (err) {
      console.error('[SetupWizard] ❌ Self-hosted login failed:', err);
      const errorMessage = err instanceof Error ? err.message : 'Self-hosted login failed';
      console.error('[SetupWizard] Error message:', errorMessage);
      setError(errorMessage);
      setLoading(false);
    }
  };

  const handleSelfHostedOAuthSuccess = async (_userInfo: UserInfo) => {
    console.log('[SetupWizard] 🔐 OAuth login successful, completing setup');
    console.log(`[SetupWizard] Server: ${serverConfig?.url}`);

    if (!serverConfig) {
      console.error('[SetupWizard] ❌ No server configured');
      setError('No server configured');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      console.log('[SetupWizard] Step 1: OAuth already completed');
      console.log('[SetupWizard] Step 2: Switching to self-hosted mode...');
      await connectionModeService.switchToSelfHosted(serverConfig);
      console.log('[SetupWizard] ✅ Switched to self-hosted mode');

      console.log('[SetupWizard] Step 3: Initializing external backend...');
      await tauriBackendService.initializeExternalBackend();
      console.log('[SetupWizard] ✅ External backend initialized');

      console.log('[SetupWizard] ✅ Setup complete, calling onComplete()');
      onComplete();
    } catch (err) {
      console.error('[SetupWizard] ❌ Self-hosted OAuth login completion failed:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to complete login';
      console.error('[SetupWizard] Error message:', errorMessage);
      setError(errorMessage);
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribePromise = listen<string>('deep-link', async (event) => {
      const url = event.payload;
      if (!url) return;

      try {
        const parsed = new URL(url);

        // Supabase sends tokens in the URL hash
        const hash = parsed.hash.replace(/^#/, '');
        const params = new URLSearchParams(hash);
        const accessToken = params.get('access_token');
        const type = params.get('type') || parsed.searchParams.get('type');

        if (!type || (type !== 'signup' && type !== 'recovery' && type !== 'magiclink')) {
          return;
        }

        if (!accessToken) {
          console.error('[SetupWizard] Deep link missing access_token');
          return;
        }

        setLoading(true);
        setError(null);

        await authService.completeSupabaseSession(accessToken, serverConfig?.url || STIRLING_SAAS_URL);
        await connectionModeService.switchToSaaS(serverConfig?.url || STIRLING_SAAS_URL);
        tauriBackendService.startBackend().catch(console.error);
        onComplete();
      } catch (err) {
        console.error('[SetupWizard] Failed to handle deep link', err);
        setError(err instanceof Error ? err.message : 'Failed to complete signup');
        setLoading(false);
      }
    });

    return () => {
      void unsubscribePromise.then((unsub) => unsub());
    };
  }, [onComplete, serverConfig?.url]);

  const handleBack = () => {
    setError(null);
    if (activeStep === SetupStep.SelfHostedLogin) {
      setActiveStep(SetupStep.ServerSelection);
    } else if (activeStep === SetupStep.ServerSelection) {
      setActiveStep(SetupStep.SaaSLogin);
      setServerConfig({ url: STIRLING_SAAS_URL });
    } else if (activeStep === SetupStep.SaaSSignup) {
      setActiveStep(SetupStep.SaaSLogin);
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
          onSwitchToSignup={handleSwitchToSignup}
          loading={loading}
          error={error}
        />
      )}

      {activeStep === SetupStep.SaaSSignup && (
        <SaaSSignupScreen
          loading={loading}
          error={error}
          onLogin={handleSaaSLogin}
          onSwitchToLogin={handleSwitchToLogin}
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
          enabledOAuthProviders={serverConfig?.enabledOAuthProviders}
          onLogin={handleSelfHostedLogin}
          onOAuthSuccess={handleSelfHostedOAuthSuccess}
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
