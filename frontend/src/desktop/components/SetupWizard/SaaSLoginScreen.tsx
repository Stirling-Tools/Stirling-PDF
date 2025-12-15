import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import LoginHeader from '@app/routes/login/LoginHeader';
import ErrorMessage from '@app/routes/login/ErrorMessage';
import EmailPasswordForm from '@app/routes/login/EmailPasswordForm';
import DividerWithText from '@app/components/shared/DividerWithText';
import { DesktopOAuthButtons } from '@app/components/SetupWizard/DesktopOAuthButtons';
import { SelfHostedLink } from '@app/components/SetupWizard/SelfHostedLink';
import { UserInfo } from '@app/services/authService';
import SignupForm from '@app/routes/signup/SignupForm';
import { useSignupFormValidation, SignupFieldErrors } from '@app/routes/signup/SignupFormValidation';
import { authService } from '@app/services/authService';
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
  const [confirmPassword, setConfirmPassword] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [signupMode, setSignupMode] = useState(false);
  const [signupFieldErrors, setSignupFieldErrors] = useState<SignupFieldErrors>({});
  const [signupSuccessMessage, setSignupSuccessMessage] = useState<string | null>(null);
  const [isSignupSubmitting, setIsSignupSubmitting] = useState(false);
  const { validateSignupForm } = useSignupFormValidation();

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

  const handleSignupSubmit = async () => {
    setValidationError(null);
    setSignupSuccessMessage(null);
    setSignupFieldErrors({});

    const validation = validateSignupForm(email, password, confirmPassword);
    if (!validation.isValid) {
      setValidationError(validation.error);
      setSignupFieldErrors(validation.fieldErrors || {});
      return;
    }

    try {
      setIsSignupSubmitting(true);
      await authService.signUpSaas(email.trim(), password);
      setSignupSuccessMessage(t('signup.checkEmailConfirmation', 'Check your email for a confirmation link to complete your registration.'));
      setSignupFieldErrors({});
      setValidationError(null);
    } catch (err) {
      setSignupSuccessMessage(null);
      const message = err instanceof Error ? err.message : t('signup.unexpectedError', { message: 'Unknown error' });
      setValidationError(message);
    } finally {
      setIsSignupSubmitting(false);
    }
  };

  return (
    <>
      <LoginHeader
        title={
          signupMode
            ? t('signup.title', 'Create an account')
            : t('setup.saas.title', 'Sign in to Stirling Cloud')
        }
        subtitle={
          signupMode
            ? t('signup.subtitle', 'Join Stirling PDF')
            : undefined
        }
      />

      <ErrorMessage error={displayError} />
      {signupSuccessMessage && (
        <div className="success-message">
          <p className="success-message-text">{signupSuccessMessage}</p>
        </div>
      )}

      {!signupMode && (
        <>
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
              setSignupSuccessMessage(null);
            }}
            setPassword={(value) => {
              setPassword(value);
              setValidationError(null);
              setSignupSuccessMessage(null);
            }}
            onSubmit={handleEmailPasswordSubmit}
            isSubmitting={loading}
            submitButtonText={t('setup.login.submit', 'Login')}
          />

          <div className="navigation-link-container" style={{ marginTop: '0.5rem', textAlign: 'right' }}>
            <button
              type="button"
              onClick={() => {
                setSignupMode(true);
                setValidationError(null);
                setSignupSuccessMessage(null);
                setSignupFieldErrors({});
              }}
              className="navigation-link-button"
              disabled={loading}
            >
              {t('signup.signUp', 'Sign Up')}
            </button>
          </div>
        </>
      )}

      {signupMode && (
        <>
          <SignupForm
            email={email}
            password={password}
            confirmPassword={confirmPassword}
            setEmail={(value) => {
              setEmail(value);
              setValidationError(null);
              // keep success message in case user wants to re-login later
              setSignupFieldErrors({});
            }}
            setPassword={(value) => {
              setPassword(value);
              setValidationError(null);
              // keep success message in case user wants to re-login later
              setSignupFieldErrors({});
            }}
            setConfirmPassword={(value) => {
              setConfirmPassword(value);
              setValidationError(null);
              // keep success message in case user wants to re-login later
              setSignupFieldErrors({});
            }}
            onSubmit={handleSignupSubmit}
            isSubmitting={loading || isSignupSubmitting}
            fieldErrors={signupFieldErrors}
            showName={false}
            showTerms={false}
          />
          <div className="navigation-link-container" style={{ marginTop: '0.5rem', textAlign: 'right' }}>
            <button
              type="button"
              onClick={() => {
                setSignupMode(false);
                setValidationError(null);
                setSignupSuccessMessage(null);
                setSignupFieldErrors({});
              }}
              className="navigation-link-button"
              disabled={loading || isSignupSubmitting}
            >
              {t('login.logIn', 'Log In')}
            </button>
          </div>
        </>
      )}

      <SelfHostedLink onClick={onSelfHostedClick} disabled={loading} />
    </>
  );
};
