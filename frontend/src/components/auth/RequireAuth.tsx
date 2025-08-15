import { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../lib/useSession'

interface RequireAuthProps {
  children: ReactNode
  fallbackPath?: string
}

export function RequireAuth({ children, fallbackPath = '/login' }: RequireAuthProps) {
  const { session, loading, error } = useAuth()
  const location = useLocation()

  console.log('[RequireAuth Debug] Auth check:', {
    hasSession: !!session,
    loading,
    hasError: !!error,
    currentPath: location.pathname,
    fallbackPath
  })

  // Show loading spinner while checking auth
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Checking authentication...</p>
        </div>
      </div>
    )
  }

  // Redirect to login if not authenticated
  if (!session) {
    const redirectPath = `${fallbackPath}?next=${encodeURIComponent(location.pathname + location.search)}`
    console.log('[RequireAuth Debug] Redirecting to login:', redirectPath)
    return <Navigate to={redirectPath} replace />
  }

  // Render protected content
  return <>{children}</>
}

export default RequireAuth