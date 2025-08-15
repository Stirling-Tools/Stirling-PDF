import { useState } from 'react'
import { useAuth } from '../lib/useSession'

// Simplified login page for testing without redirect logic
export default function LoginTest() {
  const { session, loading, error } = useAuth()
  const [debugInfo, setDebugInfo] = useState<any>(null)

  console.log('[LoginTest Debug] Component rendered:', {
    hasSession: !!session,
    loading,
    hasError: !!error,
    timestamp: new Date().toISOString()
  })

  const testConnection = () => {
    const info = {
      authState: {
        hasSession: !!session,
        loading,
        hasError: !!error,
        errorMessage: error?.message
      },
      environment: {
        supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
        hasKey: !!import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY,
        mode: import.meta.env.MODE
      },
      location: {
        href: window.location.href,
        pathname: window.location.pathname,
        origin: window.location.origin
      }
    }
    
    console.log('[LoginTest Debug] Connection test:', info)
    setDebugInfo(info)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-4 text-center">
          Login Test Page
        </h1>
        
        <div className="space-y-4">
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
            <h3 className="font-medium text-blue-900 mb-2">Auth Status</h3>
            <div className="text-sm text-blue-800 space-y-1">
              <div>Loading: {loading ? 'Yes' : 'No'}</div>
              <div>Has Session: {session ? 'Yes' : 'No'}</div>
              <div>Error: {error ? error.message : 'None'}</div>
            </div>
          </div>

          <button
            onClick={testConnection}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Test Connection
          </button>

          {debugInfo && (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-medium text-gray-700">
                Debug Info
              </summary>
              <pre className="mt-2 p-3 bg-gray-100 rounded text-xs overflow-auto max-h-48">
                {JSON.stringify(debugInfo, null, 2)}
              </pre>
            </details>
          )}

          <div className="text-center space-y-2">
            <p className="text-sm text-gray-600">
              If you can see this page, routing is working
            </p>
            <p className="text-xs text-gray-500">
              Path: {window.location.pathname}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}