import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/UseSession'

/**
 * OAuth Callback Handler
 *
 * This component is rendered after OAuth providers (GitHub, Google, etc.) redirect back.
 * The JWT has already been set as an HttpOnly cookie by the Spring backend.
 * We just need to refresh the session state and redirect to the home page.
 */
export default function AuthCallback() {
  const navigate = useNavigate()
  const { refreshSession } = useAuth()

  useEffect(() => {
    const handleCallback = async () => {
      try {
        console.log('[AuthCallback] Handling OAuth callback...')

        // JWT already set as cookie by backend
        // Refresh session to load user info into state
        await refreshSession()

        console.log('[AuthCallback] Session refreshed, redirecting to home')

        // Redirect to home page
        navigate('/', { replace: true })
      } catch (error) {
        console.error('[AuthCallback] Error:', error)
        navigate('/login', {
          replace: true,
          state: { error: 'OAuth login failed. Please try again.' }
        })
      }
    }

    handleCallback()
  }, [navigate, refreshSession])

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh'
    }}>
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3"></div>
        <div className="text-gray-600">
          Completing authentication...
        </div>
      </div>
    </div>
  )
}
