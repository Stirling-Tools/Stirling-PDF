import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import LoginHeader from '@app/routes/login/LoginHeader';
import ErrorMessage from '@app/routes/login/ErrorMessage';
import SignupForm from '@app/routes/signup/SignupForm';
import { useSignupFormValidation, SignupFieldErrors } from '@app/routes/signup/SignupFormValidation';
import { authService } from '@app/services/authService';
import '@app/routes/authShared/auth.css';

interface SaaSSignupScreenProps {
  loading: boolean;
  error: string | null;
  onLogin: (username: string, password: string) => Promise<void>;
  onSwitchToLogin: () => void;
}

export const SaaSSignupScreen: React.FC<SaaSSignupScreenProps> = ({
  loading,
  error,
  onLogin: _onLogin,
  onSwitchToLogin: _onSwitchToLogin,
}) => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [signupFieldErrors, setSignupFieldErrors] = useState<SignupFieldErrors>({});
  const [signupSuccessMessage, setSignupSuccessMessage] = useState<string | null>(null);
  const [isSignupSubmitting, setIsSignupSubmitting] = useState(false);
  const { validateSignupForm } = useSignupFormValidation();

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
        title={t('signup.title', 'Create an account')}
        subtitle={t('signup.subtitle', 'Join Stirling PDF')}
      />

      <ErrorMessage error={displayError} />
      {signupSuccessMessage && (
        <div className="success-message">
          <p className="success-message-text">{signupSuccessMessage}</p>
        </div>
      )}

      <SignupForm
        email={email}
        password={password}
        confirmPassword={confirmPassword}
        setEmail={(value) => {
          setEmail(value);
          setValidationError(null);
          setSignupFieldErrors({});
        }}
        setPassword={(value) => {
          setPassword(value);
          setValidationError(null);
          setSignupFieldErrors({});
        }}
        setConfirmPassword={(value) => {
          setConfirmPassword(value);
          setValidationError(null);
          setSignupFieldErrors({});
        }}
        onSubmit={handleSignupSubmit}
        isSubmitting={loading || isSignupSubmitting}
        fieldErrors={signupFieldErrors}
        showName={false}
        showTerms={false}
      />

    </>
  );
};
