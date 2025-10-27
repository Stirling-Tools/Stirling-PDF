import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { springAuth } from '../auth/springAuthClient';
import { useAuth } from '../auth/UseSession';
import { useTranslation } from 'react-i18next';
import { useDocumentMeta } from '../hooks/useDocumentMeta';
import AuthLayout from './authShared/AuthLayout';

// Import login components
import LoginHeader from './login/LoginHeader';
import ErrorMessage from './login/ErrorMessage';
import EmailPasswordForm from './login/EmailPasswordForm';
import OAuthButtons from './login/OAuthButtons';
import DividerWithText from '../components/shared/DividerWithText';
import LoggedInState from './login/LoggedInState';
import { BASE_PATH } from '../constants/app';

export default function Login() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const { t } = useTranslation();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Prefill email from query param (e.g. after password reset)
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const emailFromQuery = url.searchParams.get('email');
      if (emailFromQuery) {
        setEmail(emailFromQuery);
      }
    } catch (_) {
      // ignore
    }
  }, []);

  const baseUrl = window.location.origin + BASE_PATH;

  // Set document meta
  useDocumentMeta({
    title: `${t('login.title', 'Sign in')} - Stirling PDF`,
    description: t('app.description', 'The Free Adobe Acrobat alternative (10M+ Downloads)'),
    ogTitle: `${t('login.title', 'Sign in')} - Stirling PDF`,
    ogDescription: t('app.description', 'The Free Adobe Acrobat alternative (10M+ Downloads)'),
    ogImage: `${baseUrl}/og_images/home.png`,
    ogUrl: `${window.location.origin}${window.location.pathname}`
  });

  // Show logged in state if authenticated
  if (session && !loading) {
    return <LoggedInState />;
  }

  const signInWithProvider = async (provider: 'github' | 'google' | 'apple' | 'azure') => {
    try {
      setIsSigningIn(true);
      setError(null);

      console.log(`[Login] Signing in with ${provider}`);

      // Redirect to Spring OAuth2 endpoint
      const { error } = await springAuth.signInWithOAuth({
        provider,
        options: { redirectTo: `${BASE_PATH}/auth/callback` }
      });

      if (error) {
        console.error(`[Login] ${provider} error:`, error);
        setError(t('login.failedToSignIn', { provider, message: error.message }) || `Failed to sign in with ${provider}`);
      }
    } catch (err) {
      console.error(`[Login] Unexpected error:`, err);
      setError(t('login.unexpectedError', { message: err instanceof Error ? err.message : 'Unknown error' }) || 'An unexpected error occurred');
    } finally {
      setIsSigningIn(false);
    }
  };

  const signInWithEmail = async () => {
    if (!email || !password) {
      setError(t('login.pleaseEnterBoth') || 'Please enter both email and password');
      return;
    }

    try {
      setIsSigningIn(true);
      setError(null);

      console.log('[Login] Signing in with email:', email);

      const { user, session, error } = await springAuth.signInWithPassword({
        email: email.trim(),
        password: password
      });

      if (error) {
        console.error('[Login] Email sign in error:', error);
        setError(error.message);
      } else if (user && session) {
        console.log('[Login] Email sign in successful');
        // Auth state will update automatically and Landing will redirect to home
        // No need to navigate manually here
      }
    } catch (err) {
      console.error('[Login] Unexpected error:', err);
      setError(t('login.unexpectedError', { message: err instanceof Error ? err.message : 'Unknown error' }) || 'An unexpected error occurred');
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleForgotPassword = () => {
    navigate('/auth/reset');
  };

  return (
    <AuthLayout>
      <LoginHeader title={t('login.login') || 'Sign in'} />

      <ErrorMessage error={error} />

      {/* OAuth first */}
      <OAuthButtons
        onProviderClick={signInWithProvider}
        isSubmitting={isSigningIn}
        layout="vertical"
      />

      {/* Divider between OAuth and Email */}
      <DividerWithText text={t('signup.or', 'or')} respondsToDarkMode={false} opacity={0.4} />

      {/* Sign in with email button (primary color to match signup CTA) */}
      <div className="auth-section">
        <button
          type="button"
          onClick={() => setShowEmailForm(true)}
          disabled={isSigningIn}
          className="w-full px-4 py-[0.75rem] rounded-[0.625rem] text-base font-semibold mb-2 cursor-pointer border-0 disabled:opacity-50 disabled:cursor-not-allowed auth-cta-button"
        >
          {t('login.useEmailInstead', 'Login with email')}
        </button>
      </div>

      {showEmailForm && (
        <div style={{ marginTop: '1rem' }}>
          <EmailPasswordForm
            email={email}
            password={password}
            setEmail={setEmail}
            setPassword={setPassword}
            onSubmit={signInWithEmail}
            isSubmitting={isSigningIn}
            submitButtonText={isSigningIn ? (t('login.loggingIn') || 'Signing in...') : (t('login.login') || 'Sign in')}
          />
        </div>
      )}

      {showEmailForm && (
        <div className="auth-section-sm">
          <button
            type="button"
            onClick={handleForgotPassword}
            className="auth-link-black"
          >
            {t('login.forgotPassword', 'Forgot your password?')}
          </button>
        </div>
      )}

      {/* Divider then signup link */}
      <DividerWithText text={t('signup.or', 'or')} respondsToDarkMode={false} opacity={0.4} />

      <div style={{ textAlign: 'center', margin: '0.5rem 0 0.25rem' }}>
        <button
          type="button"
          onClick={() => navigate('/signup')}
          className="auth-link-black"
        >
          {t('signup.signUp', 'Sign up')}
        </button>
      </div>

    </AuthLayout>
  );
}
