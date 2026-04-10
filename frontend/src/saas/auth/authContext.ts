import { createContext } from 'react'
import type { Session, User as SupabaseUser, AuthError } from '@supabase/supabase-js'
import type { CreditSummary, SubscriptionInfo, CreditCheckResult } from '@app/types/credits'
import type { ProfilePictureMetadata } from '@app/services/avatarSyncService'

// Extend Supabase User to include optional username for compatibility
export type User = SupabaseUser & { username?: string }

export interface TrialStatus {
  isTrialing: boolean
  trialEnd: string
  daysRemaining: number
  hasPaymentMethod: boolean
  hasScheduledSub: boolean
  status: string
}

export interface AuthContextType {
  session: Session | null
  user: User | null
  loading: boolean
  error: AuthError | null
  creditBalance: number | null
  subscription: SubscriptionInfo | null
  creditSummary: CreditSummary | null
  isPro: boolean | null
  trialStatus: TrialStatus | null
  profilePictureUrl: string | null
  profilePictureMetadata: ProfilePictureMetadata | null
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

export const AuthContext = createContext<AuthContextType>({
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
