import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from '@mantine/core';
import LoginHeader from '@app/routes/login/LoginHeader';
import ErrorMessage from '@app/routes/login/ErrorMessage';
import EmailPasswordForm from '@app/routes/login/EmailPasswordForm';
import DividerWithText from '@app/components/shared/DividerWithText';
import { DesktopOAuthButtons, DesktopOAuthProvider } from '@app/components/SetupWizard/DesktopOAuthButtons';
import { authService, UserInfo } from '@app/services/authService';
import '@app/routes/authShared/auth.css';

interface SelfHostedLoginScreenProps {
  serverUrl: string;
  enabledOAuthProviders?: DesktopOAuthProvider[];
  onLogin: (username: string, password: string) => Promise<void>;
  onOAuthSuccess: (userInfo: UserInfo) => Promise<void>;
  loading: boolean;
  error: string | null;
}

export const SelfHostedLoginScreen: React.FC<SelfHostedLoginScreenProps> = ({
  serverUrl,
  enabledOAuthProviders,
  onLogin,
  onOAuthSuccess,
  loading,
  error,
}) => {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = async () => {
    // Validation
    if (!username.trim()) {
      setValidationError(t('setup.login.error.emptyUsername', 'Please enter your username'));
      return;
    }

    if (!password) {
      setValidationError(t('setup.login.error.emptyPassword', 'Please enter your password'));
      return;
    }

    setValidationError(null);
    await onLogin(username.trim(), password);
  };

  const handleOAuthError = (errorMessage: string) => {
    setValidationError(errorMessage);
  };

  const waitForSsoCompletion = (popup: Window): Promise<string> => {
    return new Promise((resolve, reject) => {
      const messageHandler = (event: MessageEvent) => {
        if (event.origin !== window.location.origin || typeof event.data !== 'object' || event.data === null) {
          return;
        }

        const { type, token, error } = event.data as { type?: string; token?: string; error?: string };
        if (type === 'stirling-sso-success' && token) {
          cleanup();
          resolve(token);
        } else if (type === 'stirling-sso-error') {
          cleanup();
          reject(new Error(error || 'SSO login failed'));
        }
      };

      const interval = window.setInterval(() => {
        if (popup.closed) {
          cleanup();
          reject(new Error('Login window was closed before authentication completed'));
        }
      }, 500);

      const cleanup = () => {
        window.clearInterval(interval);
        window.removeEventListener('message', messageHandler);
      };

      window.addEventListener('message', messageHandler);
    });
  };

  const handleSelfHostedOAuthLogin = async (provider: DesktopOAuthProvider) => {
    setValidationError(null);

    if (!provider.url) {
      handleOAuthError(t('setup.login.error.configFetch', 'Failed to fetch server configuration. Please check the URL and try again.'));
      return;
    }

    // Mark SSO flow so the callback can short-circuit verification
    localStorage.setItem('desktop_sso_in_progress', JSON.stringify({ mode: 'selfhosted' }));

    const popup = window.open(provider.url, '_blank', 'width=480,height=720');
    if (!popup) {
      localStorage.removeItem('desktop_sso_in_progress');
      handleOAuthError(t('setup.login.error.oauthFailed', 'OAuth login failed. Please try again.'));
      return;
    }

    try {
      const token = await waitForSsoCompletion(popup);
      localStorage.removeItem('desktop_sso_in_progress');

      await authService.applyExternalToken(token);
      await onOAuthSuccess({ username: provider.label || provider.id });
    } catch (err) {
      localStorage.removeItem('desktop_sso_in_progress');
      const message = err instanceof Error ? err.message : t('setup.login.error.oauthFailed', 'OAuth login failed. Please try again.');
      handleOAuthError(message);
    } finally {
      try {
        popup.close();
      } catch (_) {
        // ignore
      }
    }
  };

  const displayError = error || validationError;

  return (
    <>
      <LoginHeader
        title={t('setup.selfhosted.title', 'Sign in to Server')}
        subtitle={t('setup.selfhosted.subtitle', 'Enter your server credentials')}
      />

      <ErrorMessage error={displayError} />

      <Text size="sm" mb="md">
        {t('setup.login.connectingTo', 'Connecting to:')} <Text span fw="500">{serverUrl}</Text>
      </Text>

      {/* Show OAuth buttons if providers are available */}
      {enabledOAuthProviders && enabledOAuthProviders.length > 0 && (
        <>
          <DesktopOAuthButtons
            onOAuthSuccess={onOAuthSuccess}
            onError={handleOAuthError}
            isDisabled={loading}
            serverUrl={serverUrl}
            providers={enabledOAuthProviders}
            onProviderClick={handleSelfHostedOAuthLogin}
          />

          <DividerWithText
            text={t('setup.login.orContinueWith', 'Or continue with email')}
            respondsToDarkMode={false}
            opacity={0.4}
          />
        </>
      )}

      <EmailPasswordForm
        email={username}
        password={password}
        setEmail={(value) => {
          setUsername(value);
          setValidationError(null);
        }}
        setPassword={(value) => {
          setPassword(value);
          setValidationError(null);
        }}
        onSubmit={handleSubmit}
        isSubmitting={loading}
        submitButtonText={t('setup.login.submit', 'Login')}
      />
    </>
  );
};
