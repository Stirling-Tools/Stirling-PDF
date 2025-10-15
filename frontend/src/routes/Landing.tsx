import { useMemo } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/UseSession'
import HomePage from '../pages/HomePage'
import Login from './Login'

/**
 * Landing component - Smart router based on authentication status
 *
 * If user is authenticated: Show HomePage
 * If user is not authenticated: Show Login or redirect to /login
 */
export default function Landing() {
  const { session, loading } = useAuth()
  const location = useLocation()

  console.log('[Landing] State:', {
    pathname: location.pathname,
    loading,
    hasSession: !!session,
  })

  // Show loading while checking auth
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3"></div>
          <div className="text-gray-600">
            Loading...
          </div>
        </div>
      </div>
    )
  }

  // If we have a session, show the main app
  if (session) {
    return <HomePage />
  }

  // If we're at home route ("/"), show login directly (marketing/landing page)
  // Otherwise navigate to login (fixes URL mismatch for tool routes)
  const isHome = location.pathname === '/' || location.pathname === ''
  if (isHome) {
    return <Login />
  }

  // For non-home routes without auth, navigate to login (preserves from location)
  return <Navigate to="/login" replace state={{ from: location }} />
}
