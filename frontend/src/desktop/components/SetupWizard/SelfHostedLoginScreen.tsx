import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from '@mantine/core';
import LoginHeader from '@app/routes/login/LoginHeader';
import ErrorMessage from '@app/routes/login/ErrorMessage';
import EmailPasswordForm from '@app/routes/login/EmailPasswordForm';
import DividerWithText from '@app/components/shared/DividerWithText';
import { DesktopOAuthButtons } from '@app/components/SetupWizard/DesktopOAuthButtons';
import { UserInfo } from '@app/services/authService';
import { SSOProviderConfig } from '@app/services/connectionModeService';
import '@app/routes/authShared/auth.css';

interface SelfHostedLoginScreenProps {
  serverUrl: string;
  enabledOAuthProviders?: SSOProviderConfig[];
  loginMethod?: string;
  onLogin: (username: string, password: string) => Promise<void>;
  onOAuthSuccess: (userInfo: UserInfo) => Promise<void>;
  mfaCode: string;
  setMfaCode: (value: string) => void;
  requiresMfa: boolean;
  loading: boolean;
  error: string | null;
}

export const SelfHostedLoginScreen: React.FC<SelfHostedLoginScreenProps> = ({
  serverUrl,
  enabledOAuthProviders,
  loginMethod = 'all',
  onLogin,
  onOAuthSuccess,
  mfaCode,
  setMfaCode,
  requiresMfa,
  loading,
  error,
}) => {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  // Check if username/password authentication is allowed
  const isUserPassAllowed = loginMethod === 'all' || loginMethod === 'normal';

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

    if (requiresMfa && !mfaCode.trim()) {
      setValidationError(t('login.mfaRequired', 'Two-factor code required'));
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
        subtitle={isUserPassAllowed ? t('setup.selfhosted.subtitle', 'Enter your server credentials') : undefined}
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
            mode="selfHosted"
            providers={enabledOAuthProviders}
          />

          {/* Only show divider if username/password auth is also allowed */}
          {isUserPassAllowed && (
            <DividerWithText
              text={t('setup.login.orContinueWith', 'Or continue with email')}
              respondsToDarkMode={false}
              opacity={0.4}
            />
          )}
        </>
      )}

      {/* Only show email/password form if username/password auth is allowed */}
      {isUserPassAllowed && (
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
          mfaCode={mfaCode}
          setMfaCode={(value) => {
            setMfaCode(value);
            setValidationError(null);
          }}
          showMfaField={requiresMfa || Boolean(mfaCode)}
          requiresMfa={requiresMfa}
          onSubmit={handleSubmit}
          isSubmitting={loading}
          submitButtonText={t('setup.login.submit', 'Login')}
        />
      )}
    </>
  );
};
