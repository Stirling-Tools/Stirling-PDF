import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/useSession'
import { supabase } from './lib/supabase'
import RequireAuth from './components/auth/RequireAuth'
import Login from './routes/Login'
import AuthCallback from './routes/AuthCallback'
import AuthDebug from './routes/AuthDebug'

// Example protected component
function ProtectedDashboard() {
  const { session, user, signOut } = useAuth()

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
              <p className="text-gray-600">Welcome back!</p>
            </div>
            <button
              onClick={signOut}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Sign Out
            </button>
          </div>

          <div className="space-y-4">
            <div className="p-4 bg-green-50 border border-green-200 rounded-md">
              <h3 className="font-medium text-green-900">Authentication Successful!</h3>
              <p className="text-green-700 text-sm">You are signed in as {user?.email}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-gray-50 rounded">
                <div className="text-sm font-medium text-gray-700">User ID</div>
                <div className="font-mono text-gray-900 break-all">{user?.id}</div>
              </div>
              <div className="p-4 bg-gray-50 rounded">
                <div className="text-sm font-medium text-gray-700">Email</div>
                <div className="text-gray-900">{user?.email}</div>
              </div>
              <div className="p-4 bg-gray-50 rounded">
                <div className="text-sm font-medium text-gray-700">Provider</div>
                <div className="text-gray-900">{user?.app_metadata?.provider}</div>
              </div>
            </div>

            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
                Full Session Data
              </summary>
              <pre className="mt-2 p-3 bg-gray-100 rounded text-xs overflow-auto max-h-48">
                {JSON.stringify(session, null, 2)}
              </pre>
            </details>
          </div>
        </div>
      </div>
    </div>
  )
}

// Example home page
function HomePage() {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 text-center">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Stirling PDF - Authentication Demo
          </h1>
          <p className="text-gray-600 mb-6">
            This is a demo of the Supabase authentication integration
          </p>
          
          <div className="space-x-4">
            <a 
              href="/login" 
              className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Go to Login
            </a>
            <a 
              href="/dashboard" 
              className="inline-block px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              Protected Dashboard
            </a>
            <a 
              href="/debug" 
              className="inline-block px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
            >
              Debug Panel
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

// Router configuration
const router = createBrowserRouter([
  // Public routes
  { path: '/', element: <HomePage /> },
  { path: '/login', element: <Login /> },
  { path: '/auth/callback', element: <AuthCallback /> },
  { path: '/debug', element: <AuthDebug /> },
  
  // Protected routes
  { 
    path: '/dashboard', 
    element: (
      <RequireAuth>
        <ProtectedDashboard />
      </RequireAuth>
    ) 
  },
])

// Main App component with auth provider
export default function AuthExample() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  )
}

// Additional utility functions for easy integration
export const authUtils = {
  // Sign in with GitHub (can be called from anywhere)
  signInWithGitHub: async (nextPath = '/') => {
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo }
    })
    if (error) {
      console.error('Sign in error:', error)
      throw error
    }
  },

  // Sign out (can be called from anywhere)
  signOut: async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
      console.error('Sign out error:', error)
      throw error
    }
  },

  // Get current session
  getCurrentSession: async () => {
    const { data, error } = await supabase.auth.getSession()
    return { session: data.session, error }
  },

  // Check if user is authenticated
  isAuthenticated: async () => {
    const { session } = await authUtils.getCurrentSession()
    return !!session
  }
}

// Import this in your main App.tsx or wherever you want to add auth
// import AuthExample from './AuthExample'