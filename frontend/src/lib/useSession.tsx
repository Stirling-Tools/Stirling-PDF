import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { supabase } from './supabase'
import type { Session, User, AuthError } from '@supabase/supabase-js'

interface AuthContextType {
  session: Session | null
  user: User | null
  loading: boolean
  error: AuthError | null
  signOut: () => Promise<void>
  refreshSession: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  error: null,
  signOut: async () => {},
  refreshSession: async () => {}
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<AuthError | null>(null)

  const refreshSession = async () => {
    try {
      setLoading(true)
      setError(null)
      const { data, error } = await supabase.auth.refreshSession()
      
      if (error) {
        console.error('[Auth Debug] Session refresh error:', error)
        setError(error)
        setSession(null)
      } else {
        console.log('[Auth Debug] Session refreshed successfully')
        setSession(data.session)
      }
    } catch (err) {
      console.error('[Auth Debug] Unexpected error during session refresh:', err)
      setError(err as AuthError)
    } finally {
      setLoading(false)
    }
  }

  const signOut = async () => {
    try {
      setError(null)
      const { error } = await supabase.auth.signOut()
      
      if (error) {
        console.error('[Auth Debug] Sign out error:', error)
        setError(error)
      } else {
        console.log('[Auth Debug] Signed out successfully')
        setSession(null)
      }
    } catch (err) {
      console.error('[Auth Debug] Unexpected error during sign out:', err)
      setError(err as AuthError)
    }
  }

  useEffect(() => {
    let mounted = true

    // Load current session on first mount
    const initializeAuth = async () => {
      try {
        console.log('[Auth Debug] Initializing auth...')
        const { data, error } = await supabase.auth.getSession()
        
        if (!mounted) return
        
        if (error) {
          console.error('[Auth Debug] Initial session error:', error)
          setError(error)
        } else {
          console.log('[Auth Debug] Initial session loaded:', {
            hasSession: !!data.session,
            userId: data.session?.user?.id,
            email: data.session?.user?.email
          })
          setSession(data.session)
        }
      } catch (err) {
        console.error('[Auth Debug] Unexpected error during auth initialization:', err)
        if (mounted) {
          setError(err as AuthError)
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    initializeAuth()

    // Subscribe to auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        if (!mounted) return

        console.log('[Auth Debug] Auth state change:', {
          event,
          hasSession: !!newSession,
          userId: newSession?.user?.id,
          email: newSession?.user?.email,
          timestamp: new Date().toISOString()
        })

        // Don't run supabase calls inside this callback; schedule them
        setTimeout(() => {
          if (mounted) {
            setSession(newSession)
            setError(null)
            
            // Additional handling for specific events
            if (event === 'SIGNED_OUT') {
              console.log('[Auth Debug] User signed out, clearing session')
            } else if (event === 'SIGNED_IN') {
              console.log('[Auth Debug] User signed in successfully')
            } else if (event === 'TOKEN_REFRESHED') {
              console.log('[Auth Debug] Token refreshed')
            } else if (event === 'USER_UPDATED') {
              console.log('[Auth Debug] User updated')
            }
          }
        }, 0)
      }
    )

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const value: AuthContextType = {
    session,
    user: session?.user ?? null,
    loading,
    error,
    signOut,
    refreshSession
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

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
    console.log('[Auth Debug] Current auth state:', {
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