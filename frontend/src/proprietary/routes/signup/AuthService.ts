import { springAuth } from '@app/auth/springAuthClient';
import { BASE_PATH } from '@app/constants/app';

export const useAuthService = () => {

  const signUp = async (
    email: string,
    password: string,
    name: string
  ) => {
    console.log('[Signup] Creating account for:', email);

    const { user, session, error } = await springAuth.signUp({
      email: email.trim(),
      password: password,
      options: {
        data: { full_name: name },
        emailRedirectTo: `${BASE_PATH}/auth/callback`
      }
    });

    if (error) {
      console.error('[Signup] Sign up error:', error);
      throw new Error(error.message);
    }

    if (user) {
      console.log('[Signup] Sign up successful:', user);
      return {
        user: user,
        session: session,
        requiresEmailConfirmation: user && !session
      };
    }

    throw new Error('Unknown error occurred during signup');
  };

  const signInWithProvider = async (provider: 'github' | 'google' | 'apple' | 'azure') => {
    const { error } = await springAuth.signInWithOAuth({
      provider,
      options: { redirectTo: `${BASE_PATH}/auth/callback` }
    });

    if (error) {
      throw new Error(error.message);
    }
  };

  return {
    signUp,
    signInWithProvider
  };
}
;
