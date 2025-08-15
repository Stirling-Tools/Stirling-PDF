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

  const signInWithOAuth = async (provider: 'github' | 'google' | 'facebook', nextPath = '/') => {
    try {
      setIsSigningIn(true)
      setError(null)
      setDebugInfo(null)

      // Supabase redirects back to your app after OAuth
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`
      
      console.log(`[Login Debug] Initiating ${provider} OAuth:`, {
        provider,
        redirectTo,
        nextPath,
        origin: window.location.origin
      })

      const oauthOptions: any = { 
        redirectTo
      }

      // Provider-specific options
      if (provider === 'github') {
        oauthOptions.queryParams = {
          access_type: 'offline',
          prompt: 'consent',
        }
      } else if (provider === 'google') {
        oauthOptions.queryParams = {
          access_type: 'offline',
          prompt: 'consent',
        }
      } else if (provider === 'facebook') {
        oauthOptions.queryParams = {
          scope: 'email',
        }
      }

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: oauthOptions
      })

      console.log(`[Login Debug] ${provider} OAuth response:`, { data, error })

      if (error) {
        console.error(`[Login Debug] ${provider} OAuth initiation error:`, error)
        setError(`Failed to initiate ${provider} sign in: ${error.message}`)
        setDebugInfo({ provider, error })
      } else {
        console.log(`[Login Debug] ${provider} OAuth initiated successfully, redirecting...`)
        // OAuth redirect should happen automatically
        // If we reach here without redirect, there might be an issue
        const expectedDomain = provider === 'github' 
          ? 'github.com' 
          : provider === 'google' 
            ? 'accounts.google.com'
            : 'facebook.com'
        setTimeout(() => {
          if (!window.location.href.includes(expectedDomain)) {
            setError('OAuth redirect did not occur as expected')
            setDebugInfo({ 
              provider,
              message: `Expected redirect to ${expectedDomain} but still on our domain`,
              currentUrl: window.location.href 
            })
          }
        }, 2000)
      }
    } catch (err) {
      console.error(`[Login Debug] ${provider} unexpected error:`, err)
      setError(`Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}`)
      setDebugInfo({ provider, error: err })
    } finally {
      setIsSigningIn(false)
    }
  }

  const signInWithGitHub = (nextPath = '/') => signInWithOAuth('github', nextPath)
  const signInWithGoogle = (nextPath = '/') => signInWithOAuth('google', nextPath)
  const signInWithFacebook = (nextPath = '/') => signInWithOAuth('facebook', nextPath)

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
    <div 
      className="min-h-screen flex items-center justify-center p-4"
      style={{ 
        backgroundColor: '#f9fafb',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}
    >
      <div 
        className="w-full bg-white rounded-xl shadow-lg p-6"
        style={{ 
          maxWidth: '384px',
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'
        }}
      >
        <div className="text-center mb-6">
          <div className="text-4xl mb-3">🔐</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Sign In
          </h1>
          <p className="text-gray-600 text-sm">
            Choose your preferred authentication method
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800 text-xs font-medium">Error</p>
            <p className="text-red-700 text-xs">{error}</p>
          </div>
        )}

        <div className="space-y-3">
          {/* GitHub Login */}
          <button
            onClick={() => signInWithGitHub()}
            disabled={isSigningIn}
            className="w-full flex items-center justify-center px-4 py-2.5 border border-gray-300 rounded-lg bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-400 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '10px 16px',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              backgroundColor: '#ffffff',
              fontSize: '14px',
              fontWeight: '500',
              color: '#374151',
              cursor: isSigningIn ? 'not-allowed' : 'pointer',
              opacity: isSigningIn ? 0.5 : 1,
              transition: 'all 200ms ease-in-out'
            }}
            onMouseEnter={(e) => {
              if (!isSigningIn) {
                e.currentTarget.style.backgroundColor = '#f9fafb';
                e.currentTarget.style.borderColor = '#9ca3af';
              }
            }}
            onMouseLeave={(e) => {
              if (!isSigningIn) {
                e.currentTarget.style.backgroundColor = '#ffffff';
                e.currentTarget.style.borderColor = '#d1d5db';
              }
            }}
          >
            <svg className="w-4 h-4 mr-3" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            GitHub
          </button>

          {/* Google Login */}
          <button
            onClick={() => signInWithGoogle()}
            disabled={isSigningIn}
            className="w-full flex items-center justify-center px-4 py-2.5 border border-gray-300 rounded-lg bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm hover:shadow"
          >
            <svg className="w-4 h-4 mr-3" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Google
          </button>

          {/* Facebook Login */}
          <button
            onClick={() => signInWithFacebook()}
            disabled={isSigningIn}
            className="w-full flex items-center justify-center px-4 py-2.5 border border-gray-300 rounded-lg bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm hover:shadow"
          >
            <svg className="w-4 h-4 mr-3" viewBox="0 0 24 24" fill="#1877F2">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
            Facebook
          </button>

          {import.meta.env.DEV && (
            <div className="pt-4 border-t border-gray-200 mt-6">
              <details className="group">
                <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-700 list-none">
                  <span className="flex items-center justify-center">
                    <span>Development Tools</span>
                    <svg className="w-4 h-4 ml-1 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </span>
                </summary>
                <div className="mt-3 space-y-2">
                  <button
                    onClick={testSupabaseConnection}
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    Test Connection
                  </button>
                  <div className="text-xs text-gray-400 space-y-1 px-2">
                    <p><strong>Mode:</strong> {import.meta.env.MODE}</p>
                    <p><strong>Supabase:</strong> {import.meta.env.VITE_SUPABASE_URL ? '✓' : '✗'}</p>
                  </div>
                </div>
              </details>
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

        <div className="mt-6 text-center">
          <p className="text-xs text-gray-400">
            Secure authentication via Supabase
          </p>
        </div>
      </div>
    </div>
  )
}