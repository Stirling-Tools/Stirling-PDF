import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/useSession'

export default function Login() {
  const navigate = useNavigate()
  const { session, user, loading, signOut } = useAuth()
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [debugInfo, setDebugInfo] = useState<any>(null)

  // Show logged in state instead of redirecting
  if (session && !loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-2xl w-full bg-white rounded-lg shadow-md p-8">
          <div className="text-center mb-8">
            <div className="text-6xl mb-4">✅</div>
            <h1 className="text-3xl font-bold text-green-600 mb-2">
              YOU ARE LOGGED IN
            </h1>
            <p className="text-gray-600">
              Successfully authenticated with Supabase
            </p>
          </div>

          <div className="space-y-6">
            {/* User Info Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
                <div className="text-sm font-medium text-blue-900 mb-1">User ID</div>
                <div className="font-mono text-blue-800 break-all text-sm">
                  {user?.id}
                </div>
              </div>
              
              <div className="p-4 bg-green-50 border border-green-200 rounded-md">
                <div className="text-sm font-medium text-green-900 mb-1">Email</div>
                <div className="text-green-800">
                  {user?.email}
                </div>
              </div>
              
              <div className="p-4 bg-purple-50 border border-purple-200 rounded-md">
                <div className="text-sm font-medium text-purple-900 mb-1">Provider</div>
                <div className="text-purple-800">
                  {user?.app_metadata?.provider || 'Unknown'}
                </div>
              </div>
              
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-md">
                <div className="text-sm font-medium text-yellow-900 mb-1">Created</div>
                <div className="text-yellow-800 text-sm">
                  {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unknown'}
                </div>
              </div>
            </div>

            {/* JWT Token Display */}
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-md">
              <div className="text-sm font-medium text-gray-900 mb-2">JWT Access Token</div>
              <div className="font-mono text-xs bg-white p-3 rounded border break-all text-gray-800">
                {session?.access_token}
              </div>
              <div className="mt-2 text-xs text-gray-600">
                <strong>Expires:</strong> {session?.expires_at ? new Date(session.expires_at * 1000).toLocaleString() : 'Unknown'}
              </div>
            </div>

            {/* Refresh Token (if available) */}
            {session?.refresh_token && (
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-md">
                <div className="text-sm font-medium text-gray-900 mb-2">Refresh Token</div>
                <div className="font-mono text-xs bg-white p-3 rounded border break-all text-gray-800">
                  {session.refresh_token}
                </div>
              </div>
            )}

            {/* User Metadata */}
            {(user?.user_metadata && Object.keys(user.user_metadata).length > 0) && (
              <details className="p-4 bg-indigo-50 border border-indigo-200 rounded-md">
                <summary className="cursor-pointer text-sm font-medium text-indigo-900 hover:text-indigo-700">
                  User Metadata
                </summary>
                <pre className="mt-2 p-3 bg-white rounded text-xs overflow-auto max-h-32 text-gray-800">
                  {JSON.stringify(user.user_metadata, null, 2)}
                </pre>
              </details>
            )}

            {/* App Metadata */}
            {(user?.app_metadata && Object.keys(user.app_metadata).length > 0) && (
              <details className="p-4 bg-orange-50 border border-orange-200 rounded-md">
                <summary className="cursor-pointer text-sm font-medium text-orange-900 hover:text-orange-700">
                  App Metadata
                </summary>
                <pre className="mt-2 p-3 bg-white rounded text-xs overflow-auto max-h-32 text-gray-800">
                  {JSON.stringify(user.app_metadata, null, 2)}
                </pre>
              </details>
            )}

            {/* Full Session Data */}
            <details className="p-4 bg-red-50 border border-red-200 rounded-md">
              <summary className="cursor-pointer text-sm font-medium text-red-900 hover:text-red-700">
                Full Session Object
              </summary>
              <pre className="mt-2 p-3 bg-white rounded text-xs overflow-auto max-h-48 text-gray-800">
                {JSON.stringify(session, null, 2)}
              </pre>
            </details>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-3 pt-4 border-t">
              <button
                onClick={() => navigate('/')}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Go to Home
              </button>
              
              <button
                onClick={() => navigate('/debug')}
                className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
              >
                Debug Panel
              </button>
              
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
              >
                Refresh Session
              </button>
              
              <button
                onClick={async () => {
                  await signOut()
                  window.location.reload()
                }}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const signInWithGitHub = async (nextPath = '/') => {
    try {
      setIsSigningIn(true)
      setError(null)
      setDebugInfo(null)

      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`
      
      console.log('[Login Debug] Initiating GitHub OAuth:', {
        redirectTo,
        nextPath,
        origin: window.location.origin
      })

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: { 
          redirectTo,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          }
        }
      })

      console.log('[Login Debug] OAuth response:', { data, error })

      if (error) {
        console.error('[Login Debug] OAuth initiation error:', error)
        setError(`Failed to initiate sign in: ${error.message}`)
        setDebugInfo({ error })
      } else {
        console.log('[Login Debug] OAuth initiated successfully, redirecting...')
        // OAuth redirect should happen automatically
        // If we reach here without redirect, there might be an issue
        setTimeout(() => {
          if (!window.location.href.includes('github.com')) {
            setError('OAuth redirect did not occur as expected')
            setDebugInfo({ 
              message: 'Expected redirect to GitHub but still on our domain',
              currentUrl: window.location.href 
            })
          }
        }, 2000)
      }
    } catch (err) {
      console.error('[Login Debug] Unexpected error:', err)
      setError(`Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}`)
      setDebugInfo({ error: err })
    } finally {
      setIsSigningIn(false)
    }
  }

  const testSupabaseConnection = async () => {
    try {
      console.log('[Login Debug] Testing Supabase connection...')
      setError(null)
      
      // Test basic connection
      const { data, error } = await supabase.auth.getSession()
      
      const testResult = {
        connectionSuccess: !error,
        hasSession: !!data.session,
        error: error?.message,
        url: supabase.supabaseUrl,
        key: supabase.supabaseKey.substring(0, 20) + '...'
      }
      
      console.log('[Login Debug] Connection test result:', testResult)
      setDebugInfo(testResult)
      
      if (error) {
        setError(`Connection test failed: ${error.message}`)
      }
    } catch (err) {
      console.error('[Login Debug] Connection test error:', err)
      setError(`Connection test error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Welcome to Stirling PDF
          </h1>
          <p className="text-gray-600">
            Sign in to access your account
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-800 text-sm font-medium">Error</p>
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        <div className="space-y-4">
          <button
            onClick={() => signInWithGitHub()}
            disabled={isSigningIn}
            className="w-full flex items-center justify-center px-4 py-3 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            {isSigningIn ? 'Signing in...' : 'Continue with GitHub'}
          </button>

          {import.meta.env.DEV && (
            <div className="border-t pt-4 space-y-3">
              <h3 className="text-sm font-medium text-gray-700">Development Tools</h3>
              
              <button
                onClick={testSupabaseConnection}
                className="w-full px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Test Supabase Connection
              </button>

              <div className="text-xs text-gray-500 space-y-1">
                <p><strong>Environment:</strong> {import.meta.env.MODE}</p>
                <p><strong>Supabase URL:</strong> {import.meta.env.VITE_SUPABASE_URL ? '✓ Configured' : '✗ Missing'}</p>
                <p><strong>Supabase Key:</strong> {import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY ? '✓ Configured' : '✗ Missing'}</p>
              </div>
            </div>
          )}
        </div>

        {debugInfo && import.meta.env.DEV && (
          <details className="mt-6">
            <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
              Debug Information
            </summary>
            <pre className="mt-2 p-3 bg-gray-100 rounded text-xs overflow-auto max-h-48">
              {JSON.stringify(debugInfo, null, 2)}
            </pre>
          </details>
        )}

        <div className="mt-8 text-center">
          <p className="text-xs text-gray-500">
            This is a demo login page for testing authentication
          </p>
        </div>
      </div>
    </div>
  )
}