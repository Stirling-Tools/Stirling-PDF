import { useState, useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@app/auth/UseSession'
import { useAppConfig } from '@app/contexts/AppConfigContext'
import HomePage from '@app/pages/HomePage'
// Login component is used via routing, not directly imported
import FirstLoginModal from '@app/components/shared/FirstLoginModal'
import { accountService } from '@app/services/accountService'

/**
 * Landing component - Smart router based on authentication status
 *
 * If login is disabled: Show HomePage directly (anonymous mode)
 * If user is authenticated: Show HomePage
 * If user is not authenticated: Show Login or redirect to /login
 */
export default function Landing() {
  const { session, loading: authLoading, refreshSession } = useAuth();
  const { config, loading: configLoading } = useAppConfig();
  const location = useLocation();
  const [isFirstLogin, setIsFirstLogin] = useState(false);
  const [checkingFirstLogin, setCheckingFirstLogin] = useState(false);
  const [username, setUsername] = useState('');

  const loading = authLoading || configLoading;

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
    loginEnabled: config?.enableLogin,
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
  if (config?.enableLogin === false) {
    console.debug('[Landing] Login disabled - showing app in anonymous mode');
    return <HomePage />;
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
  return <Navigate to="/login" replace state={{ from: location }} />;
}
