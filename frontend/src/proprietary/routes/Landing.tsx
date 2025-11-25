import { useState, useEffect } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@app/auth/UseSession'
import { useAppConfig } from '@app/contexts/AppConfigContext'
import HomePage from '@app/pages/HomePage'
// Login component is used via routing, not directly imported
import FirstLoginModal from '@app/components/shared/FirstLoginModal'
import { accountService } from '@app/services/accountService'
import { useBackendProbe } from '@app/hooks/useBackendProbe'
import AuthLayout from '@app/routes/authShared/AuthLayout'
import LoginHeader from '@app/routes/login/LoginHeader'
import { useTranslation } from 'react-i18next'

/**
 * Landing component - Smart router based on authentication status
 *
 * If login is disabled: Show HomePage directly (anonymous mode)
 * If user is authenticated: Show HomePage
 * If user is not authenticated: Show Login or redirect to /login
 */
export default function Landing() {
  const { session, loading: authLoading, refreshSession } = useAuth();
  const { config, loading: configLoading, refetch } = useAppConfig();
  const backendProbe = useBackendProbe();
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [isFirstLogin, setIsFirstLogin] = useState(false);
  const [checkingFirstLogin, setCheckingFirstLogin] = useState(false);
  const [username, setUsername] = useState('');

  const loading = authLoading || configLoading || backendProbe.loading;
  const loginDisabled = backendProbe.loginDisabled || config?.enableLogin === false;
  const loginEnabled = !loginDisabled;

  // Check if user needs to change password on first login
  useEffect(() => {
    const checkFirstLogin = async () => {
      if (session && config?.enableLogin !== false) {
        try {
          setCheckingFirstLogin(true)
          const accountData = await accountService.getAccountData()
          setUsername(accountData.username)
          setIsFirstLogin(accountData.changeCredsFlag)
        } catch (err) {
          console.error('Failed to check first login status:', err)
          // If account endpoint fails (404), user probably doesn't have security enabled
          setIsFirstLogin(false)
        } finally {
          setCheckingFirstLogin(false)
        }
      }
    }

    checkFirstLogin()
  }, [session, config])

  useEffect(() => {
    if (backendProbe.status === 'up') {
      void refetch();
    }
  }, [backendProbe.status, refetch]);

  const handlePasswordChanged = async () => {
    // After password change, backend logs out the user
    // Refresh session to detect logout and redirect to login
    setIsFirstLogin(false) // Close modal first
    await refreshSession()
    // The auth system will automatically redirect to login when session is null
  }

  console.log('[Landing] State:', {
    pathname: location.pathname,
    loading,
    hasSession: !!session,
    loginEnabled,
  });

  // Show loading while checking auth and config
  if (loading || checkingFirstLogin) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3"></div>
          <div className="text-gray-600">
            Loading...
          </div>
        </div>
      </div>
    );
  }

  // If login is disabled, show app directly (anonymous mode)
  if (config?.enableLogin === false || backendProbe.loginDisabled) {
    console.debug('[Landing] Login disabled - showing app in anonymous mode');
    return <HomePage />;
  }

  // If backend is not up yet and user is not authenticated, show a branded status screen
  if (!session && backendProbe.status !== 'up') {
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
            {t('backendStartup.unreachable', 'The application cannot currently connect to the backend. Verify the backend status and network connectivity, then try again.') ||
              'The application cannot currently connect to the backend. Verify the backend status and network connectivity, then try again.'}
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

  // If we have a session, show the main app
  if (session) {
    return (
      <>
        <FirstLoginModal
          opened={isFirstLogin}
          onPasswordChanged={handlePasswordChanged}
          username={username}
        />
        <HomePage />
      </>
    );
  }

  // No session - redirect to login page
  // This ensures the URL always shows /login when not authenticated
  return loginEnabled
    ? <Navigate to="/login" replace state={{ from: location }} />
    : <HomePage />;
}
