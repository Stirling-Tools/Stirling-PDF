import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { setAuthData, type AuthUser } from '@app/auth/supabase'
import { Button } from '@mantine/core'
import { withBasePath } from '@app/constants/app'

interface CallbackState {
  status: 'processing' | 'success' | 'error'
  message: string
}

/**
 * OAuth callback handler for Spring Security.
 * The backend redirects here with JWT token and user info as query params
 * after successful OAuth authentication.
 */
export default function AuthCallback() {
  const navigate = useNavigate()
  const [state, setState] = useState<CallbackState>({
    status: 'processing',
    message: 'Processing authentication...'
  })

  useEffect(() => {
    const url = new URL(window.location.href)
    const token = url.searchParams.get('token')
    const userId = url.searchParams.get('userId')
    const email = url.searchParams.get('email')
    const username = url.searchParams.get('username')
    const planTier = url.searchParams.get('planTier')
    const error = url.searchParams.get('error')

    if (error) {
      setState({ status: 'error', message: `Authentication failed: ${error}` })
      setTimeout(() => navigate('/login', { replace: true }), 3000)
      return
    }

    if (token && userId) {
      const user: AuthUser = {
        id: userId,
        email: email || null,
        username: username || email || userId,
        planTier: planTier || 'free',
      }
      setAuthData(token, user)
      setState({ status: 'success', message: 'Sign in successful! Redirecting...' })

      const next = url.searchParams.get('next') || '/'
      setTimeout(() => navigate(next, { replace: true }), 1000)
    } else {
      setState({ status: 'error', message: 'No authentication data received' })
      setTimeout(() => navigate('/login', { replace: true }), 2000)
    }
  }, [navigate])

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <div className="w-full max-w-md rounded-2xl bg-white/80 backdrop-blur shadow-xl p-8">
        <div className="text-center">
          <img
            src={withBasePath("/branding/StirlingPDFLogoNoTextDark.svg")}
            alt="Stirling PDF"
            className="mx-auto mb-5 h-8 opacity-80"
          />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {state.status === 'processing' ? 'Signing you in' : state.status === 'success' ? "You're all set!" : 'Authentication failed'}
          </h1>
          <p className={`text-base ${state.status === 'error' ? 'text-red-600' : state.status === 'success' ? 'text-green-600' : 'text-blue-600'}`}>
            {state.message}
          </p>
          {state.status === 'processing' && (
            <div className="mt-6">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            </div>
          )}
          {state.status === 'error' && (
            <div className="mt-6">
              <Button onClick={() => navigate('/login', { replace: true })}>
                Back to login
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
