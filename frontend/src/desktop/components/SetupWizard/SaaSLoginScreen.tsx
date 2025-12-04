import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import LoginHeader from '@app/routes/login/LoginHeader';
import ErrorMessage from '@app/routes/login/ErrorMessage';
import EmailPasswordForm from '@app/routes/login/EmailPasswordForm';
import DividerWithText from '@app/components/shared/DividerWithText';
import { DesktopOAuthButtons } from '@app/components/SetupWizard/DesktopOAuthButtons';
import { SelfHostedLink } from '@app/components/SetupWizard/SelfHostedLink';
import { UserInfo } from '@app/services/authService';
import '@app/routes/authShared/auth.css';

interface SaaSLoginScreenProps {
  serverUrl: string;
  onLogin: (username: string, password: string) => Promise<void>;
  onOAuthSuccess: (userInfo: UserInfo) => Promise<void>;
  onSelfHostedClick: () => void;
  loading: boolean;
  error: string | null;
}

export const SaaSLoginScreen: React.FC<SaaSLoginScreenProps> = ({
  serverUrl,
  onLogin,
  onOAuthSuccess,
  onSelfHostedClick,
  loading,
  error,
}) => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleEmailPasswordSubmit = async () => {
    // Validation
    if (!email.trim()) {
      setValidationError(t('setup.login.error.emptyEmail', 'Please enter your email'));
      return;
    }

    if (!password) {
      setValidationError(t('setup.login.error.emptyPassword', 'Please enter your password'));
      return;
    }

    setValidationError(null);
    await onLogin(email.trim(), password);
  };

  const handleOAuthError = (errorMessage: string) => {
    setValidationError(errorMessage);
  };

  const displayError = error || validationError;

  return (
    <>
      <LoginHeader title={t('setup.saas.title', 'Sign in to Stirling Cloud')} />

      <ErrorMessage error={displayError} />

      <DesktopOAuthButtons
        onOAuthSuccess={onOAuthSuccess}
        onError={handleOAuthError}
        isDisabled={loading}
        serverUrl={serverUrl}
        providers={['google', 'github']}
      />

      <DividerWithText
        text={t('setup.login.orContinueWith', 'Or continue with email')}
        respondsToDarkMode={false}
        opacity={0.4}
      />

      <EmailPasswordForm
        email={email}
        password={password}
        setEmail={(value) => {
          setEmail(value);
          setValidationError(null);
        }}
        setPassword={(value) => {
          setPassword(value);
          setValidationError(null);
        }}
        onSubmit={handleEmailPasswordSubmit}
        isSubmitting={loading}
        submitButtonText={t('setup.login.submit', 'Login')}
      />

      <SelfHostedLink onClick={onSelfHostedClick} disabled={loading} />
    </>
  );
};
