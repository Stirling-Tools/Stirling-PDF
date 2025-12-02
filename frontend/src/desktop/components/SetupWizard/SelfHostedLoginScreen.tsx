import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import LoginHeader from '@app/routes/login/LoginHeader';
import ErrorMessage from '@app/routes/login/ErrorMessage';
import EmailPasswordForm from '@app/routes/login/EmailPasswordForm';
import DividerWithText from '@app/components/shared/DividerWithText';
import { DesktopOAuthButtons, OAuthProvider } from '@app/components/SetupWizard/DesktopOAuthButtons';
import { UserInfo } from '@app/services/authService';
import '@app/routes/authShared/auth.css';

interface SelfHostedLoginScreenProps {
  serverUrl: string;
  enabledOAuthProviders?: string[];
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

  const displayError = error || validationError;

  return (
    <>
      <LoginHeader
        title={t('setup.selfhosted.title', 'Sign in to Server')}
        subtitle={t('setup.selfhosted.subtitle', 'Enter your server credentials')}
      />

      <ErrorMessage error={displayError} />

      <div style={{ marginBottom: '1rem' }}>
        <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: 0 }}>
          {t('setup.login.connectingTo', 'Connecting to:')} <strong>{serverUrl}</strong>
        </p>
      </div>

      {/* Show OAuth buttons if providers are available */}
      {enabledOAuthProviders && enabledOAuthProviders.length > 0 && (
        <>
          <DesktopOAuthButtons
            onOAuthSuccess={onOAuthSuccess}
            onError={handleOAuthError}
            isDisabled={loading}
            serverUrl={serverUrl}
            providers={enabledOAuthProviders as OAuthProvider[]}
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
