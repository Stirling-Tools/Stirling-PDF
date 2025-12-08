import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDocumentMeta } from '@app/hooks/useDocumentMeta';
import { useAuth } from '@app/auth/UseSession';
import AuthLayout from '@app/routes/authShared/AuthLayout';
import '@app/routes/authShared/auth.css';
import { BASE_PATH } from '@app/constants/app';

// Import signup components
import LoginHeader from '@app/routes/login/LoginHeader';
import ErrorMessage from '@app/routes/login/ErrorMessage';
import DividerWithText from '@app/components/shared/DividerWithText';
import SignupForm from '@app/routes/signup/SignupForm';
import { useSignupFormValidation, SignupFieldErrors } from '@app/routes/signup/SignupFormValidation';
import { useAuthService } from '@app/routes/signup/AuthService';

export default function Signup() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { session, loading } = useAuth();
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<SignupFieldErrors>({});

  // Redirect immediately if user has valid session (JWT already validated by AuthProvider)
  useEffect(() => {
    if (!loading && session) {
      console.debug('[Signup] User already authenticated, redirecting to home');
      navigate('/', { replace: true });
    }
  }, [session, loading, navigate]);

  const baseUrl = window.location.origin + BASE_PATH;

  // Set document meta
  useDocumentMeta({
    title: `${t('signup.title', 'Create an account')} - Stirling PDF`,
    description: t('app.description', 'The Free Adobe Acrobat alternative (10M+ Downloads)'),
    ogTitle: `${t('signup.title', 'Create an account')} - Stirling PDF`,
    ogDescription: t('app.description', 'The Free Adobe Acrobat alternative (10M+ Downloads)'),
    ogImage: `${baseUrl}/og_images/home.png`,
    ogUrl: `${window.location.origin}${window.location.pathname}`
  });

  const { validateSignupForm } = useSignupFormValidation();
  const { signUp } = useAuthService();

  const handleSignUp = async () => {
    const validation = validateSignupForm(email, password, confirmPassword);
    if (!validation.isValid) {
      setError(validation.error);
      setFieldErrors(validation.fieldErrors || {});
      return;
    }

    try {
      setIsSigningUp(true);
      setError(null);
      setFieldErrors({});

      const result = await signUp(email, password, '');

      if (result.user) {
        // Show success message and redirect to login
        setError(null);
        setTimeout(() => navigate('/login'), 2000);
      }
    } catch (err) {
      console.error('[Signup] Unexpected error:', err);
      setError(err instanceof Error ? err.message : t('signup.unexpectedError', { message: 'Unknown error' }));
    } finally {
      setIsSigningUp(false);
    }
  };

  return (
    <AuthLayout>
      <LoginHeader title={t('signup.title', 'Create an account')} subtitle={t('signup.subtitle', 'Join Stirling PDF')} />

      <ErrorMessage error={error} />

      {/* Signup form - shown immediately */}
      <SignupForm
        email={email}
        password={password}
        confirmPassword={confirmPassword}
        setEmail={setEmail}
        setPassword={setPassword}
        setConfirmPassword={setConfirmPassword}
        onSubmit={handleSignUp}
        isSubmitting={isSigningUp}
        fieldErrors={fieldErrors}
        showName={false}
        showTerms={false}
      />

      <DividerWithText text={t('signup.or', 'or')} respondsToDarkMode={false} opacity={0.4} />

      {/* Bottom row - centered */}
      <div style={{ textAlign: 'center', margin: '0.5rem 0 0.25rem' }}>
        <button
          type="button"
          onClick={() => navigate('/login')}
          className="auth-link-black"
        >
          {t('login.logIn', 'Log In')}
        </button>
      </div>
    </AuthLayout>
  );
}
