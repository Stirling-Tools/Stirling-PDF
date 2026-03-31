import { useContext, useEffect } from 'react'
import { AuthContext } from '@app/auth/authContext'

export function useAuth() {
  const context = useContext(AuthContext)

  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }

  return context
}

// Debug hook to expose auth state for debugging
export function useAuthDebug() {
  const auth = useAuth()

  useEffect(() => {
    console.debug('[Auth Debug] Current auth state:', {
      hasSession: !!auth.session,
      hasUser: !!auth.user,
      loading: auth.loading,
      hasError: !!auth.error,
      userId: auth.user?.id,
      email: auth.user?.email,
      provider: auth.user?.app_metadata?.provider
    })
  }, [auth.session, auth.user, auth.loading, auth.error])

  return auth
}
