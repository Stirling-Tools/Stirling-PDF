import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { springAuth } from '@app/auth/springAuthClient';
import { useAuth } from '@app/auth/UseSession';
import { useTranslation } from 'react-i18next';
import { useDocumentMeta } from '@app/hooks/useDocumentMeta';
import { useAppConfig } from '@app/contexts/AppConfigContext';
import AuthLayout from '@app/routes/authShared/AuthLayout';

// Import login components
import LoginHeader from '@app/routes/login/LoginHeader';
import ErrorMessage from '@app/routes/login/ErrorMessage';
import EmailPasswordForm from '@app/routes/login/EmailPasswordForm';
import OAuthButtons, { DEBUG_SHOW_ALL_PROVIDERS, oauthProviderConfig } from '@app/routes/login/OAuthButtons';
import DividerWithText from '@app/components/shared/DividerWithText';
import LoggedInState from '@app/routes/login/LoggedInState';
import { BASE_PATH } from '@app/constants/app';

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { session, loading } = useAuth();
  const { config, loading: configLoading } = useAppConfig();
  const { t } = useTranslation();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [enabledProviders, setEnabledProviders] = useState<string[]>([]);
  const [hasSSOProviders, setHasSSOProviders] = useState(false);
  const [_enableLogin, setEnableLogin] = useState<boolean | null>(null);
  const [backendCheckFailed, setBackendCheckFailed] = useState(false);
  const [hasRedirected, setHasRedirected] = useState(false);

  // Check AppConfig first - if login is disabled, redirect to home immediately
  useEffect(() => {
    if (!configLoading && config?.enableLogin === false && !hasRedirected) {
      console.debug('[Login] Config loaded, login disabled - redirecting to home');
      setHasRedirected(true);
      navigate('/', { replace: true });
    }
  }, [config, configLoading, navigate, hasRedirected]);

  // Fetch enabled SSO providers and login config from backend
  useEffect(() => {
    let isMounted = true;

    // Don't fetch if config is still loading or if we know login is disabled
    if (configLoading) {
      console.debug('[Login] Waiting for config to load before fetching providers');
      return;
    }

    if (config?.enableLogin === false) {
      console.debug('[Login] Login disabled per config, skipping provider fetch');
      return;
    }

    const fetchProviders = async () => {
      try {
        const response = await fetch(`${BASE_PATH}/api/v1/proprietary/ui-data/login`, {
          cache: 'no-cache'
        });

        if (!isMounted) return;

        if (!response.ok) {
          // 404 likely means security is disabled (non-proprietary backend)
          // Check the general status endpoint to see if backend is up
          if (response.status === 404) {
            console.debug('[Login] Proprietary endpoint not found - checking if security is disabled (this is expected behavior when security is disabled)');

            try {
              const statusResponse = await fetch(`${BASE_PATH}/api/v1/info/status`, {
                cache: 'no-cache'
              });

              if (statusResponse.ok) {
                // Backend is up, but security is disabled
                // This means the config is wrong - login is actually disabled
                console.debug('[Login] Backend is up but security disabled - redirecting to home');

                // Set a flag in sessionStorage so Landing knows login is actually disabled
                sessionStorage.setItem('loginActuallyDisabled', 'true');

                navigate('/', { replace: true });
                return;
              }
            } catch (statusErr) {
              console.debug('[Login] Status check failed, backend may be starting up');
            }

            // Backend is not responding properly - redirect to startup page
            console.debug('[Login] Backend starting up - redirecting to backend startup page');
            setBackendCheckFailed(true);
            sessionStorage.setItem('backendStartupRedirect', window.location.pathname + window.location.search);

            setTimeout(() => {
              if (isMounted) {
                navigate('/backend-startup', { replace: true });
              }
            }, 300);
            return;
          }

          // 503 means backend is starting up
          if (response.status === 503) {
            console.warn('[Login] Backend unavailable (503) - redirecting to backend startup');
            setBackendCheckFailed(true);
            sessionStorage.setItem('backendStartupRedirect', window.location.pathname + window.location.search);

            setTimeout(() => {
              if (isMounted) {
                navigate('/backend-startup', { replace: true });
              }
            }, 300);
            return;
          }

          const errorText = await response.text();
          throw new Error(errorText || `Failed to fetch login configuration (${response.status})`);
        }

        const data = await response.json();

        if (!isMounted) return;

        if (!data || data.enableLogin === null) {
          console.warn('[Login] Login config returned empty or null data - checking backend status');

          // Check if backend is actually up before assuming it's starting
          try {
            const statusResponse = await fetch(`${BASE_PATH}/api/v1/info/status`, {
              cache: 'no-cache'
            });

            if (statusResponse.ok) {
              // Backend is up but returning invalid data - redirect to home as fallback
              console.debug('[Login] Backend up but invalid login data - redirecting to home');
              navigate('/', { replace: true });
              return;
            }
          } catch (statusErr) {
            console.debug('[Login] Status check failed');
          }

          // Backend is not responding - redirect to startup page
          setBackendCheckFailed(true);
          sessionStorage.setItem('backendStartupRedirect', window.location.pathname + window.location.search);

          setTimeout(() => {
            if (isMounted) {
              navigate('/backend-startup', { replace: true });
            }
          }, 300);
          return;
        }

        // Check if login is disabled - if so, redirect to home
        if (data.enableLogin === false) {
          console.debug('[Login] Login disabled, redirecting to home');
          navigate('/', { replace: true });
          return;
        }

        setEnableLogin(data.enableLogin ?? true);

        // Extract provider IDs from the providerList map
        // The keys are like "/oauth2/authorization/google" - extract the last part
        const providerIds = Object.keys(data.providerList || {})
          .map(key => key.split('/').pop())
          .filter((id): id is string => id !== undefined);
        setEnabledProviders(providerIds);
      } catch (err) {
        if (!isMounted) return;

        console.error('[Login] Failed to fetch enabled providers:', err);
        setBackendCheckFailed(true);
        sessionStorage.setItem('backendStartupRedirect', window.location.pathname + window.location.search);

        setTimeout(() => {
          if (isMounted) {
            navigate('/backend-startup', { replace: true });
          }
        }, 300);
      }
    };

    fetchProviders();

    return () => {
      isMounted = false;
    };
  }, [navigate, BASE_PATH, config, configLoading]);

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

  // Show logged in state if authenticated
  if (session && !loading) {
    return <LoggedInState />;
  }

  // Show loading while checking backend, config, or redirecting
  // Also show loading if we know login is disabled (we're about to redirect)
  if (loading || configLoading || backendCheckFailed || hasRedirected || (!configLoading && config?.enableLogin === false)) {
    return (
      <AuthLayout>
        <div style={{ minHeight: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3"></div>
            <div className="text-gray-600">
              Loading...
            </div>
          </div>
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

    </AuthLayout>
  );
}
