import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react'
import { getToken, getUser, onAuthStateChange, signOut as authSignOut, type AuthUser } from '@app/auth/supabase'
import { CreditSummary, SubscriptionInfo, CreditCheckResult, ApiCredits } from '@app/types/credits'
import apiClient, { setGlobalCreditUpdateCallback } from '@app/services/apiClient'

export type User = AuthUser;

export interface TrialStatus {
  isTrialing: boolean
  trialEnd: string
  daysRemaining: number
  hasPaymentMethod: boolean
  hasScheduledSub: boolean
  status: string
}

interface AuthContextType {
  session: { token: string; user: User } | null
  user: User | null
  loading: boolean
  error: Error | null
  creditBalance: number | null
  subscription: SubscriptionInfo | null
  creditSummary: CreditSummary | null
  isPro: boolean | null
  trialStatus: TrialStatus | null
  profilePictureUrl: string | null
  profilePictureMetadata: null
  signOut: () => Promise<void>
  refreshSession: () => Promise<void>
  hasSufficientCredits: (requiredCredits: number) => CreditCheckResult
  updateCredits: (newBalance: number) => void
  refreshCredits: () => Promise<void>
  refreshProStatus: () => Promise<void>
  refreshTrialStatus: () => Promise<void>
  refreshProfilePicture: () => Promise<void>
  refreshProfilePictureMetadata: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  error: null,
  creditBalance: null,
  subscription: null,
  creditSummary: null,
  isPro: null,
  trialStatus: null,
  profilePictureUrl: null,
  profilePictureMetadata: null,
  signOut: async () => {},
  refreshSession: async () => {},
  hasSufficientCredits: () => ({ hasSufficientCredits: false, currentBalance: 0, requiredCredits: 0 }),
  updateCredits: () => {},
  refreshCredits: async () => {},
  refreshProStatus: async () => {},
  refreshTrialStatus: async () => {},
  refreshProfilePicture: async () => {},
  refreshProfilePictureMetadata: async () => {}
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [creditBalance, setCreditBalance] = useState<number | null>(null)
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null)
  const [creditSummary, setCreditSummary] = useState<CreditSummary | null>(null)
  const [isPro, setIsPro] = useState<boolean | null>(null)
  const [trialStatus, setTrialStatus] = useState<TrialStatus | null>(null)
  const [profilePictureUrl, setProfilePictureUrl] = useState<string | null>(null)

  const fetchCredits = useCallback(async () => {
    if (!getToken()) {
      setCreditBalance(null)
      setCreditSummary(null)
      setSubscription(null)
      return
    }

    try {
      const response = await apiClient.get<ApiCredits>('/api/v1/credits')
      const apiCredits = response.data

      const credits: CreditSummary = {
        currentCredits: apiCredits.totalAvailableCredits,
        maxCredits: apiCredits.weeklyCreditsAllocated + apiCredits.totalBoughtCredits,
        creditsUsed: (apiCredits.weeklyCreditsAllocated - apiCredits.weeklyCreditsRemaining) + (apiCredits.totalBoughtCredits - apiCredits.boughtCreditsRemaining),
        creditsRemaining: apiCredits.totalAvailableCredits,
        resetDate: apiCredits.weeklyResetDate,
        weeklyAllowance: apiCredits.weeklyCreditsAllocated
      }

      setCreditSummary(credits)
      setCreditBalance(credits.creditsRemaining)

      const subscriptionInfo: SubscriptionInfo = {
        status: 'active',
        tier: (credits.weeklyAllowance || 0) > 100 ? 'premium' : 'free',
        creditsPerWeek: credits.weeklyAllowance,
        maxCredits: credits.maxCredits
      }
      setSubscription(subscriptionInfo)
    } catch {
      setCreditBalance(null)
      setCreditSummary(null)
      setSubscription(null)
    }
  }, [])

  const refreshCredits = useCallback(async () => {
    await fetchCredits()
  }, [fetchCredits])

  const fetchProStatus = useCallback(async () => {
    if (!getToken()) {
      setIsPro(null)
      return
    }

    try {
      const response = await apiClient.get<{ isPro: boolean }>('/api/v1/user/plan-status')
      setIsPro(response.data.isPro)
    } catch {
      // Derive from credits if plan-status endpoint isn't available yet
      if (creditSummary) {
        setIsPro((creditSummary.weeklyAllowance || 0) > 100)
      } else {
        setIsPro(false)
      }
    }
  }, [creditSummary])

  const refreshProStatus = useCallback(async () => {
    await fetchProStatus()
  }, [fetchProStatus])

  const fetchTrialStatus = useCallback(async () => {
    if (!getToken()) {
      setTrialStatus(null)
      return
    }

    try {
      const response = await apiClient.get<TrialStatus>('/api/v1/user/trial-status')
      setTrialStatus(response.data)
    } catch {
      setTrialStatus(null)
    }
  }, [])

  const refreshTrialStatus = useCallback(async () => {
    await fetchTrialStatus()
  }, [fetchTrialStatus])

  const fetchProfilePicture = useCallback(async () => {
    if (!getToken()) {
      setProfilePictureUrl(null)
      return
    }

    try {
      const response = await apiClient.get('/api/v1/user/profile-picture', {
        responseType: 'blob'
      })
      const url = URL.createObjectURL(response.data)
      setProfilePictureUrl(url)
    } catch {
      setProfilePictureUrl(null)
    }
  }, [])

  const refreshProfilePicture = useCallback(async () => {
    await fetchProfilePicture()
  }, [fetchProfilePicture])

  const refreshProfilePictureMetadata = useCallback(async () => {
    // No-op: metadata is handled server-side now
  }, [])

  const updateCredits = useCallback((newBalance: number) => {
    setCreditBalance(newBalance)
    if (creditSummary) {
      setCreditSummary({
        ...creditSummary,
        creditsRemaining: newBalance,
        currentCredits: newBalance
      })
    }
  }, [creditSummary])

  const hasSufficientCredits = useCallback((requiredCredits: number): CreditCheckResult => {
    const currentBalance = creditBalance ?? 0
    const hasSufficient = currentBalance >= requiredCredits
    return {
      hasSufficientCredits: hasSufficient,
      currentBalance,
      requiredCredits,
      shortfall: hasSufficient ? undefined : requiredCredits - currentBalance
    }
  }, [creditBalance])

  const refreshSession = async () => {
    try {
      setLoading(true)
      setError(null)
      const currentUser = getUser()
      setUser(currentUser)
    } catch (err) {
      setError(err as Error)
    } finally {
      setLoading(false)
    }
  }

  const handleSignOut = async () => {
    try {
      setError(null)
      await authSignOut()
      setUser(null)
      setCreditBalance(null)
      setCreditSummary(null)
      setSubscription(null)
      setIsPro(null)
      setTrialStatus(null)
      setProfilePictureUrl(null)
    } catch (err) {
      setError(err as Error)
    }
  }

  // Set up global credit update callback
  useEffect(() => {
    setGlobalCreditUpdateCallback(updateCredits)
  }, [updateCredits])

  useEffect(() => {
    let mounted = true

    const initializeAuth = async () => {
      try {
        const currentUser = getUser()
        if (!mounted) return

        setUser(currentUser)

        if (currentUser && getToken()) {
          await Promise.all([
            fetchCredits(),
            fetchProStatus(),
            fetchTrialStatus(),
            fetchProfilePicture(),
          ])
        }
      } catch (err) {
        if (mounted) setError(err as Error)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    initializeAuth()

    // Subscribe to auth state changes
    const { unsubscribe } = onAuthStateChange((event, newUser) => {
      if (!mounted) return

      if (event === 'SIGNED_OUT') {
        setUser(null)
        setCreditBalance(null)
        setCreditSummary(null)
        setSubscription(null)
        setIsPro(null)
        setTrialStatus(null)
        setProfilePictureUrl(null)
      } else if (event === 'SIGNED_IN' && newUser) {
        setUser(newUser)
        setLoading(true)
        Promise.all([
          fetchCredits(),
          fetchProStatus(),
          fetchTrialStatus(),
          fetchProfilePicture(),
        ]).finally(() => setLoading(false))
      } else if (event === 'TOKEN_REFRESHED') {
        Promise.all([
          fetchCredits(),
          fetchProStatus(),
          fetchTrialStatus(),
          fetchProfilePicture(),
        ])
      }
    })

    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  const session = user && getToken() ? { token: getToken()!, user } : null

  const value: AuthContextType = {
    session,
    user,
    loading,
    error,
    creditBalance,
    subscription,
    creditSummary,
    isPro,
    trialStatus,
    profilePictureUrl,
    profilePictureMetadata: null,
    signOut: handleSignOut,
    refreshSession,
    hasSufficientCredits,
    updateCredits,
    refreshCredits,
    refreshProStatus,
    refreshTrialStatus,
    refreshProfilePicture,
    refreshProfilePictureMetadata
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

export function useAuthDebug() {
  const auth = useAuth()
  useEffect(() => {
    console.debug('[Auth Debug] Current auth state:', {
      hasSession: !!auth.session,
      hasUser: !!auth.user,
      loading: auth.loading,
      hasError: !!auth.error,
    })
  }, [auth.session, auth.user, auth.loading, auth.error])
  return auth
}
