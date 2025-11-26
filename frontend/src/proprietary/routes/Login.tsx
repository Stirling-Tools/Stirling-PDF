import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Text, Stack, Alert } from '@mantine/core';
import { springAuth } from '@app/auth/springAuthClient';
import { useAuth } from '@app/auth/UseSession';
import { useAppConfig } from '@app/contexts/AppConfigContext';
import { useTranslation } from 'react-i18next';
import { useDocumentMeta } from '@app/hooks/useDocumentMeta';
import AuthLayout from '@app/routes/authShared/AuthLayout';
import { useBackendProbe } from '@app/hooks/useBackendProbe';
import apiClient from '@app/services/apiClient';
import { BASE_PATH } from '@app/constants/app';

// Import login components
import LoginHeader from '@app/routes/login/LoginHeader';
import ErrorMessage from '@app/routes/login/ErrorMessage';
import EmailPasswordForm from '@app/routes/login/EmailPasswordForm';
import OAuthButtons, { DEBUG_SHOW_ALL_PROVIDERS, oauthProviderConfig } from '@app/routes/login/OAuthButtons';
import DividerWithText from '@app/components/shared/DividerWithText';
import LoggedInState from '@app/routes/login/LoggedInState';

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { session, loading } = useAuth();
  const { refetch } = useAppConfig();
  const { t } = useTranslation();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState(() => searchParams.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [enabledProviders, setEnabledProviders] = useState<string[]>([]);
  const [hasSSOProviders, setHasSSOProviders] = useState(false);
  const [_enableLogin, setEnableLogin] = useState<boolean | null>(null);
  const backendProbe = useBackendProbe();
  const [isFirstTimeSetup, setIsFirstTimeSetup] = useState(false);
  const [showDefaultCredentials, setShowDefaultCredentials] = useState(false);
  const loginDisabled = backendProbe.loginDisabled === true || _enableLogin === false;

  // Periodically probe while backend isn't up so the screen can auto-advance when it comes online
  useEffect(() => {
    if (backendProbe.status === 'up' || backendProbe.loginDisabled) {
      return;
    }
    const tick = async () => {
      const result = await backendProbe.probe();
      if (result.status === 'up') {
        await refetch();
        if (loginDisabled) {
          navigate('/', { replace: true });
        }
      }
    };
    const intervalId = window.setInterval(() => {
      void tick();
    }, 5000);
    return () => window.clearInterval(intervalId);
  }, [backendProbe.status, backendProbe.loginDisabled, backendProbe.probe, refetch, navigate, loginDisabled]);

  // Redirect immediately if user has valid session (JWT already validated by AuthProvider)
  useEffect(() => {
    if (!loading && session) {
      console.debug('[Login] User already authenticated, redirecting to home');
      navigate('/', { replace: true });
    }
  }, [session, loading, navigate]);

  // If backend reports login is disabled, redirect to home (anonymous mode)
  useEffect(() => {
    if (backendProbe.loginDisabled) {
      // Slight delay to allow state updates before redirecting
      const id = setTimeout(() => navigate('/', { replace: true }), 0);
      return () => clearTimeout(id);
    }
  }, [backendProbe.loginDisabled, navigate]);

  useEffect(() => {
    if (backendProbe.status === 'up') {
      void refetch();
    }
  }, [backendProbe.status, refetch]);

  // Fetch enabled SSO providers and login config from backend
  useEffect(() => {
    const fetchProviders = async () => {
      try {
        const response = await apiClient.get('/api/v1/proprietary/ui-data/login');
        const data = response.data;

        // Check if login is disabled - if so, redirect to home
        if (data.enableLogin === false) {
          console.debug('[Login] Login disabled, redirecting to home');
          navigate('/');
          return;
        }

        setEnableLogin(data.enableLogin ?? true);

        // Set first-time setup flags
        setIsFirstTimeSetup(data.firstTimeSetup ?? false);
        setShowDefaultCredentials(data.showDefaultCredentials ?? false);

        // Extract provider IDs from the providerList map
        // The keys are like "/oauth2/authorization/google" - extract the last part
        const providerIds = Object.keys(data.providerList || {})
          .map(key => key.split('/').pop())
          .filter((id): id is string => id !== undefined);
        setEnabledProviders(providerIds);
      } catch (err) {
        console.error('[Login] Failed to fetch enabled providers:', err);
      }
    };

    if (backendProbe.status === 'up' || backendProbe.loginDisabled) {
      fetchProviders();
    }
  }, [navigate, backendProbe.status, backendProbe.loginDisabled]);

  // Update hasSSOProviders and showEmailForm when enabledProviders changes
  useEffect(() => {
    // In debug mode, check if any providers exist in the config
    const hasProviders = DEBUG_SHOW_ALL_PROVIDERS
      ? Object.keys(oauthProviderConfig).length > 0
      : enabledProviders.length > 0;
    setHasSSOProviders(hasProviders);
    // If no SSO providers, show email form by default
    if (!hasProviders) {
      setShowEmailForm(true);
    }
  }, [enabledProviders]);

  // Handle query params (email prefill, success messages, and session expiry)
  useEffect(() => {
    try {
      const emailFromQuery = searchParams.get('email');
      if (emailFromQuery) {
        setEmail(emailFromQuery);
      }

      // Check if session expired (401 redirect)
      const expired = searchParams.get('expired');
      if (expired === 'true') {
        setError(t('login.sessionExpired', 'Your session has expired. Please sign in again.'));
      }

      const messageType = searchParams.get('messageType')
      if (messageType) {
        switch (messageType) {
          case 'accountCreated':
            setSuccessMessage(t('login.accountCreatedSuccess', 'Account created successfully! You can now sign in.'))
            break
          case 'passwordChanged':
            setSuccessMessage(t('login.passwordChangedSuccess', 'Password changed successfully! Please sign in with your new password.'))
            break
          case 'credsUpdated':
            setSuccessMessage(t('login.credentialsUpdated', 'Your credentials have been updated. Please sign in again.'))
            break
        }
      }
    } catch (_) {
      // ignore
    }
  }, [searchParams, t]);

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

  // If login is disabled, short-circuit to home (avoids rendering the form after retry)
  if (loginDisabled) {
    return <Navigate to="/" replace />;
  }

  // Show logged in state if authenticated
  if (session && !loading) {
    return <LoggedInState />;
  }

  // If backend isn't ready yet, show a lightweight status screen instead of the form
  if (backendProbe.status !== 'up' && !loginDisabled) {
    const backendTitle = t('backendStartup.notFoundTitle', 'Backend not found');
    const handleRetry = async () => {
      const result = await backendProbe.probe();
      if (result.status === 'up') {
        await refetch();
        navigate('/', { replace: true });
      }
    };
    return (
      <AuthLayout>
        <LoginHeader title={backendTitle} />
        <div
          className="auth-section"
          style={{
            padding: '1.5rem',
            marginTop: '1rem',
            borderRadius: '0.75rem',
            backgroundColor: 'rgba(37, 99, 235, 0.08)',
            border: '1px solid rgba(37, 99, 235, 0.2)',
          }}
        >
          <p style={{ margin: '0 0 0.75rem 0', color: 'rgba(15, 23, 42, 0.8)' }}>
            {t('backendStartup.unreachable')}
          </p>
          <button
            type="button"
            onClick={handleRetry}
            className="auth-cta-button px-4 py-[0.75rem] rounded-[0.625rem] text-base font-semibold mt-5 border-0 cursor-pointer"
            style={{ width: 'fit-content' }}
          >
            {t('backendStartup.retry', 'Retry')}
          </button>
        </div>
      </AuthLayout>
    );
  }

  const signInWithProvider = async (provider: 'github' | 'google' | 'apple' | 'azure' | 'keycloak' | 'oidc') => {
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

  // Forgot password handler (currently unused, reserved for future implementation)
  // const handleForgotPassword = () => {
  //   navigate('/auth/reset');
  // };

  return (
    <AuthLayout>
      <LoginHeader title={t('login.login') || 'Sign in'} />

      {/* Success message */}
      {successMessage && (
        <div style={{
          padding: '1rem',
          marginBottom: '1rem',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          border: '1px solid rgba(34, 197, 94, 0.3)',
          borderRadius: '0.5rem',
          color: '#16a34a'
        }}>
          <p style={{ margin: 0, fontSize: '0.875rem', textAlign: 'center' }}>
            {successMessage}
          </p>
        </div>
      )}

      <ErrorMessage error={error} />

      {/* OAuth first */}
      <OAuthButtons
        onProviderClick={signInWithProvider}
        isSubmitting={isSigningIn}
        layout="vertical"
        enabledProviders={enabledProviders}
      />

      {/* Divider between OAuth and Email - only show if SSO is available */}
      {hasSSOProviders && (
        <DividerWithText text={t('signup.or', 'or')} respondsToDarkMode={false} opacity={0.4} />
      )}

      {/* Sign in with email button - only show if SSO providers exist */}
      {hasSSOProviders && !showEmailForm && (
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
      )}

      {/* Email form - show by default if no SSO, or when button clicked */}
      {showEmailForm && (
        <div style={{ marginTop: hasSSOProviders ? '1rem' : '0' }}>
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

      {/* Help section - only show on first-time setup with default credentials */}
      {isFirstTimeSetup && showDefaultCredentials && (
        <Alert
          color="blue"
          variant="light"
          radius="md"
          mt="xl"
        >
          <Stack gap="xs" align="center">
            <Text size="sm" fw={600} ta="center" style={{ color: 'var(--text-always-dark)' }}>
              {t('login.defaultCredentials', 'Default Login Credentials')}
            </Text>
            <Text size="sm" ta="center" style={{ color: 'var(--text-always-dark)' }}>
              <Text component="span" fw={600} style={{ color: 'var(--text-always-dark)' }}>{t('login.username', 'Username')}:</Text> admin
            </Text>
            <Text size="sm" ta="center" style={{ color: 'var(--text-always-dark)' }}>
              <Text component="span" fw={600} style={{ color: 'var(--text-always-dark)' }}>{t('login.password', 'Password')}:</Text> stirling
            </Text>
            <Text size="xs" ta="center" mt="xs" style={{ color: 'var(--text-always-dark-muted)' }}>
              {t('login.changePasswordWarning', 'Please change your password after logging in for the first time')}
            </Text>
          </Stack>
        </Alert>
      )}

    </AuthLayout>
  );
}
