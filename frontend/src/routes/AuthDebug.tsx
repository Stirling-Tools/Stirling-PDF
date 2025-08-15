import { useState } from 'react'
import { useAuth } from '../lib/useSession'
import { supabase } from '../lib/supabase'

export default function AuthDebug() {
  const { session, user, loading, error, signOut, refreshSession } = useAuth()
  const [testResults, setTestResults] = useState<any>(null)
  const [isTestingAuth, setIsTestingAuth] = useState(false)
  
  // JWT API request state
  const [apiUrl, setApiUrl] = useState(`${window.location.origin}/api/v1/admin/settings`)
  const [apiMethod, setApiMethod] = useState<'GET' | 'POST' | 'PUT' | 'DELETE'>('GET')
  const [apiRequestBody, setApiRequestBody] = useState('')
  const [apiResponse, setApiResponse] = useState<any>(null)
  const [isTestingApi, setIsTestingApi] = useState(false)

  const runAuthTests = async () => {
    setIsTestingAuth(true)
    setTestResults(null)

    const results: any = {
      timestamp: new Date().toISOString(),
      tests: {}
    }

    try {
      // Test 1: Get current session
      console.log('[Auth Debug] Testing current session...')
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      results.tests.currentSession = {
        success: !sessionError,
        hasSession: !!sessionData.session,
        error: sessionError?.message,
        userId: sessionData.session?.user?.id,
        email: sessionData.session?.user?.email
      }

      // Test 2: Get current user
      console.log('[Auth Debug] Testing current user...')
      const { data: userData, error: userError } = await supabase.auth.getUser()
      results.tests.currentUser = {
        success: !userError,
        hasUser: !!userData.user,
        error: userError?.message,
        userId: userData.user?.id,
        email: userData.user?.email
      }

      // Test 3: Environment variables
      results.tests.environment = {
        supabaseUrl: import.meta.env.VITE_SUPABASE_URL || 'MISSING',
        supabaseKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY ? 'CONFIGURED' : 'MISSING',
        mode: import.meta.env.MODE,
        dev: import.meta.env.DEV
      }

      // Test 4: Local storage
      results.tests.localStorage = {
        hasSupabaseSession: !!localStorage.getItem('sb-nrlkjfznsavsbmweiyqu-auth-token'),
        keys: Object.keys(localStorage).filter(key => key.includes('supabase') || key.includes('sb-'))
      }

      // Test 5: Context state
      results.tests.contextState = {
        hasSession: !!session,
        hasUser: !!user,
        loading,
        hasError: !!error,
        errorMessage: error?.message
      }

    } catch (err) {
      results.tests.unexpectedError = {
        message: err instanceof Error ? err.message : 'Unknown error',
        error: err
      }
    }

    console.log('[Auth Debug] Test results:', results)
    setTestResults(results)
    setIsTestingAuth(false)
  }

  const clearLocalStorage = () => {
    const keys = Object.keys(localStorage).filter(key => 
      key.includes('supabase') || key.includes('sb-')
    )
    
    keys.forEach(key => localStorage.removeItem(key))
    
    console.log('[Auth Debug] Cleared local storage keys:', keys)
    alert(`Cleared ${keys.length} auth-related localStorage keys`)
  }

  const testSignIn = async () => {
    try {
      const redirectTo = `${window.location.origin}/auth/callback`
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: { redirectTo }
      })
      
      if (error) {
        alert(`Sign in test failed: ${error.message}`)
      }
    } catch (err) {
      alert(`Sign in test error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const testApiRequest = async () => {
    if (!session?.access_token) {
      setApiResponse({
        error: 'No JWT token available. Please sign in first.',
        timestamp: new Date().toISOString()
      })
      return
    }

    setIsTestingApi(true)
    setApiResponse(null)

    const requestData = {
      url: apiUrl,
      method: apiMethod,
      timestamp: new Date().toISOString(),
      jwt: session.access_token.substring(0, 20) + '...' // Show partial token for debug
    }

    try {
      console.log('[API Debug] Making request with JWT:', requestData)

      const requestOptions: RequestInit = {
        method: apiMethod,
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        }
      }

      // Add request body for POST/PUT requests
      if ((apiMethod === 'POST' || apiMethod === 'PUT') && apiRequestBody.trim()) {
        try {
          JSON.parse(apiRequestBody) // Validate JSON
          requestOptions.body = apiRequestBody
        } catch (e) {
          setApiResponse({
            error: 'Invalid JSON in request body',
            timestamp: new Date().toISOString(),
            requestData
          })
          return
        }
      }

      const response = await fetch(apiUrl, requestOptions)
      
      let responseData: any
      const contentType = response.headers.get('content-type')
      
      if (contentType && contentType.includes('application/json')) {
        responseData = await response.json()
      } else {
        responseData = await response.text()
      }

      const result = {
        success: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        data: responseData,
        requestData,
        timestamp: new Date().toISOString()
      }

      console.log('[API Debug] Response:', result)
      setApiResponse(result)

    } catch (err) {
      const errorResult = {
        error: err instanceof Error ? err.message : 'Unknown error',
        requestData,
        timestamp: new Date().toISOString()
      }
      
      console.error('[API Debug] Request failed:', errorResult)
      setApiResponse(errorResult)
    } finally {
      setIsTestingApi(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 space-y-8">
        
        {/* Header */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Authentication Debug Panel
          </h1>
          <p className="text-gray-600">
            Debug and test authentication functionality
          </p>
        </div>

        {/* Current Auth State */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Current Authentication State
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="p-3 bg-gray-50 rounded">
              <div className="text-sm font-medium text-gray-700">Loading</div>
              <div className={`text-lg ${loading ? 'text-yellow-600' : 'text-green-600'}`}>
                {loading ? 'Yes' : 'No'}
              </div>
            </div>
            
            <div className="p-3 bg-gray-50 rounded">
              <div className="text-sm font-medium text-gray-700">Has Session</div>
              <div className={`text-lg ${session ? 'text-green-600' : 'text-red-600'}`}>
                {session ? 'Yes' : 'No'}
              </div>
            </div>
            
            <div className="p-3 bg-gray-50 rounded">
              <div className="text-sm font-medium text-gray-700">User ID</div>
              <div className="text-lg font-mono text-gray-900">
                {user?.id || 'None'}
              </div>
            </div>
            
            <div className="p-3 bg-gray-50 rounded">
              <div className="text-sm font-medium text-gray-700">Email</div>
              <div className="text-lg text-gray-900">
                {user?.email || 'None'}
              </div>
            </div>
          </div>

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-md mb-4">
              <div className="text-red-800 text-sm font-medium">Authentication Error</div>
              <div className="text-red-700 text-sm">{error.message}</div>
            </div>
          )}

          {session && (
            <details className="mb-4">
              <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
                Full Session Data
              </summary>
              <pre className="mt-2 p-3 bg-gray-100 rounded text-xs overflow-auto max-h-48">
                {JSON.stringify(session, null, 2)}
              </pre>
            </details>
          )}
        </div>

        {/* Actions */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Actions</h2>
          
          <div className="flex flex-wrap gap-3">
            <button
              onClick={runAuthTests}
              disabled={isTestingAuth}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isTestingAuth ? 'Running Tests...' : 'Run Auth Tests'}
            </button>
            
            <button
              onClick={refreshSession}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Refresh Session
            </button>
            
            <button
              onClick={testSignIn}
              className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
            >
              Test Sign In
            </button>
            
            {session && (
              <button
                onClick={signOut}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Sign Out
              </button>
            )}
            
            <button
              onClick={clearLocalStorage}
              className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700"
            >
              Clear Local Storage
            </button>
          </div>
        </div>

        {/* JWT API Request Testing */}
        {session && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              JWT API Request Testing
            </h2>
            <p className="text-gray-600 mb-4">
              Test authenticated requests to your backend using the JWT token
            </p>

            <div className="space-y-4">
              {/* URL Input */}
              <div>
                <label htmlFor="api-url" className="block text-sm font-medium text-gray-700 mb-2">
                  API URL
                </label>
                <input
                  id="api-url"
                  type="url"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  placeholder="https://example.com/api/v1/admin/settings"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Method Selection */}
              <div>
                <label htmlFor="api-method" className="block text-sm font-medium text-gray-700 mb-2">
                  HTTP Method
                </label>
                <select
                  id="api-method"
                  value={apiMethod}
                  onChange={(e) => setApiMethod(e.target.value as 'GET' | 'POST' | 'PUT' | 'DELETE')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="DELETE">DELETE</option>
                </select>
              </div>

              {/* Request Body (for POST/PUT) */}
              {(apiMethod === 'POST' || apiMethod === 'PUT') && (
                <div>
                  <label htmlFor="api-body" className="block text-sm font-medium text-gray-700 mb-2">
                    Request Body (JSON)
                  </label>
                  <textarea
                    id="api-body"
                    value={apiRequestBody}
                    onChange={(e) => setApiRequestBody(e.target.value)}
                    placeholder='{"key": "value"}'
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  />
                </div>
              )}

              {/* Token Info */}
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                <div className="text-sm font-medium text-blue-900 mb-1">JWT Token Info</div>
                <div className="text-blue-700 text-sm space-y-1">
                  <div>Token: {session?.access_token ? `${session.access_token.substring(0, 30)}...` : 'No token'}</div>
                  <div>Expires: {session?.expires_at ? new Date(session.expires_at * 1000).toLocaleString() : 'Unknown'}</div>
                </div>
              </div>

              {/* Send Request Button */}
              <button
                onClick={testApiRequest}
                disabled={isTestingApi || !apiUrl}
                className="w-full px-4 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {isTestingApi ? 'Sending Request...' : `Send ${apiMethod} Request`}
              </button>
            </div>
          </div>
        )}

        {/* API Response */}
        {apiResponse && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">API Response</h2>
            
            {apiResponse.error ? (
              <div className="p-4 bg-red-50 border border-red-200 rounded-md mb-4">
                <div className="text-red-800 text-sm font-medium">Request Failed</div>
                <div className="text-red-700 text-sm">{apiResponse.error}</div>
              </div>
            ) : (
              <div className={`p-4 ${apiResponse.success ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'} border rounded-md mb-4`}>
                <div className={`text-sm font-medium ${apiResponse.success ? 'text-green-800' : 'text-yellow-800'}`}>
                  {apiResponse.status} {apiResponse.statusText}
                </div>
                <div className={`text-sm ${apiResponse.success ? 'text-green-700' : 'text-yellow-700'}`}>
                  Request {apiResponse.success ? 'successful' : 'completed with non-2xx status'}
                </div>
              </div>
            )}

            <div className="space-y-4">
              {/* Response Headers */}
              {apiResponse.headers && (
                <details>
                  <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
                    Response Headers
                  </summary>
                  <pre className="mt-2 p-3 bg-gray-100 rounded text-xs overflow-auto max-h-32">
                    {JSON.stringify(apiResponse.headers, null, 2)}
                  </pre>
                </details>
              )}

              {/* Response Data */}
              <details open>
                <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
                  Response Data
                </summary>
                <pre className="mt-2 p-3 bg-gray-100 rounded text-xs overflow-auto max-h-96">
                  {typeof apiResponse.data === 'string' 
                    ? apiResponse.data 
                    : JSON.stringify(apiResponse.data, null, 2)}
                </pre>
              </details>

              {/* Request Debug Info */}
              {apiResponse.requestData && (
                <details>
                  <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
                    Request Debug Info
                  </summary>
                  <pre className="mt-2 p-3 bg-gray-100 rounded text-xs overflow-auto max-h-32">
                    {JSON.stringify(apiResponse.requestData, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          </div>
        )}

        {/* Test Results */}
        {testResults && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Test Results</h2>
            <pre className="p-4 bg-gray-100 rounded text-sm overflow-auto max-h-96">
              {JSON.stringify(testResults, null, 2)}
            </pre>
          </div>
        )}

        {/* Environment Info */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Environment</h2>
          <div className="space-y-2 text-sm">
            <div><strong>Mode:</strong> {import.meta.env.MODE}</div>
            <div><strong>Dev:</strong> {import.meta.env.DEV ? 'Yes' : 'No'}</div>
            <div><strong>Supabase URL:</strong> {import.meta.env.VITE_SUPABASE_URL || 'NOT SET'}</div>
            <div><strong>Supabase Key:</strong> {import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY ? 'CONFIGURED' : 'NOT SET'}</div>
            <div><strong>Origin:</strong> {window.location.origin}</div>
            <div><strong>Callback URL:</strong> {window.location.origin}/auth/callback</div>
          </div>
        </div>

      </div>
    </div>
  )
}