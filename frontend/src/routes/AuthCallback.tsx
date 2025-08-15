import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

interface CallbackState {
  status: 'processing' | 'success' | 'error'
  message: string
  details?: Record<string, any>
}

export default function AuthCallback() {
  const navigate = useNavigate()
  const [state, setState] = useState<CallbackState>({
    status: 'processing',
    message: 'Processing authentication...'
  })

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const url = new URL(window.location.href)
        const code = url.searchParams.get('code')
        const error = url.searchParams.get('error')
        const errorDescription = url.searchParams.get('error_description')
        const next = url.searchParams.get('next') || '/'

        console.log('[Auth Callback Debug] URL parameters:', {
          hasCode: !!code,
          hasError: !!error,
          error,
          errorDescription,
          next,
          fullUrl: window.location.href
        })

        // Handle OAuth errors
        if (error) {
          const errorMsg = errorDescription || error
          console.error('[Auth Callback Debug] OAuth error:', { error, errorDescription })
          
          setState({
            status: 'error',
            message: `Authentication failed: ${errorMsg}`,
            details: { error, errorDescription }
          })

          // Redirect to login page after 3 seconds
          setTimeout(() => navigate('/login', { replace: true }), 3000)
          return
        }

        // If PKCE/SSR-style code is present, exchange it for a session
        if (code) {
          console.log('[Auth Callback Debug] Exchanging code for session...')
          
          setState({
            status: 'processing',
            message: 'Exchanging authorization code...'
          })

          const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          
          if (exchangeError) {
            console.error('[Auth Callback Debug] Code exchange error:', exchangeError)
            
            setState({
              status: 'error',
              message: `Failed to complete sign in: ${exchangeError.message}`,
              details: { exchangeError }
            })

            setTimeout(() => navigate('/login', { replace: true }), 3000)
            return
          }

          console.log('[Auth Callback Debug] Code exchange successful:', {
            hasSession: !!data.session,
            userId: data.session?.user?.id,
            email: data.session?.user?.email
          })

          setState({
            status: 'success',
            message: 'Sign in successful! Redirecting...',
            details: {
              userId: data.session?.user?.id,
              email: data.session?.user?.email,
              provider: data.session?.user?.app_metadata?.provider
            }
          })
        } else {
          // No code present - might already be authenticated
          console.log('[Auth Callback Debug] No code present, checking existing session...')
          
          const { data: sessionData } = await supabase.auth.getSession()
          
          if (sessionData.session) {
            console.log('[Auth Callback Debug] Existing session found')
            setState({
              status: 'success',
              message: 'Already signed in! Redirecting...'
            })
          } else {
            console.log('[Auth Callback Debug] No session found')
            setState({
              status: 'error',
              message: 'No authentication data found'
            })
            setTimeout(() => navigate('/login', { replace: true }), 2000)
            return
          }
        }

        // Redirect to the intended destination
        const destination = next.startsWith('/') ? next : '/'
        console.log('[Auth Callback Debug] Redirecting to:', destination)
        
        setTimeout(() => navigate(destination, { replace: true }), 1500)

      } catch (err) {
        console.error('[Auth Callback Debug] Unexpected error:', err)
        
        setState({
          status: 'error',
          message: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}`,
          details: { error: err }
        })

        setTimeout(() => navigate('/login', { replace: true }), 3000)
      }
    }

    handleCallback()
  }, [navigate])

  const getStatusColor = () => {
    switch (state.status) {
      case 'processing': return 'text-blue-600'
      case 'success': return 'text-green-600'
      case 'error': return 'text-red-600'
      default: return 'text-gray-600'
    }
  }

  const getStatusIcon = () => {
    switch (state.status) {
      case 'processing': return '🔄'
      case 'success': return '✅'
      case 'error': return '❌'
      default: return '⏳'
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
        <div className="text-center">
          <div className="text-4xl mb-4">{getStatusIcon()}</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            Authentication
          </h1>
          <p className={`text-lg ${getStatusColor()}`}>
            {state.message}
          </p>
          
          {import.meta.env.DEV && state.details && (
            <details className="mt-6 text-left">
              <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
                Debug Information
              </summary>
              <pre className="mt-2 p-3 bg-gray-100 rounded text-xs overflow-auto">
                {JSON.stringify(state.details, null, 2)}
              </pre>
            </details>
          )}

          {state.status === 'processing' && (
            <div className="mt-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}