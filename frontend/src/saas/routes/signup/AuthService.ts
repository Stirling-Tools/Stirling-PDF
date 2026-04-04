import { signUp, signInWithOAuth } from '@app/auth/supabase'
import { absoluteWithBasePath } from '@app/constants/app'

export const useAuthService = () => {
  const handleSignUp = async (
    email: string,
    password: string,
    _name?: string
  ) => {
    console.log('[Signup] Creating account for:', email)
    const result = await signUp(email, password)
    return {
      user: result,
      session: null,
      requiresEmailConfirmation: false
    }
  }

  const signInWithProvider = async (provider: 'github' | 'google' | 'apple' | 'azure') => {
    const redirectTo = absoluteWithBasePath('/auth/callback')
    signInWithOAuth(provider, redirectTo)
  }

  return {
    signUp: handleSignUp,
    signInWithProvider
  }
}
