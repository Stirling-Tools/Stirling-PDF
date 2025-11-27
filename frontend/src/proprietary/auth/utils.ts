import type { User, Session } from '@app/auth/types';

/**
 * Check if user is anonymous
 */
export const isUserAnonymous = (user: User | null) => {
  return user?.is_anonymous === true;
};

/**
 * Create an anonymous user object
 */
export const createAnonymousUser = (): User => {
  return {
    id: 'anonymous',
    email: 'anonymous@local',
    username: 'Anonymous User',
    role: 'USER',
    enabled: true,
    is_anonymous: true,
    app_metadata: {
      provider: 'anonymous',
    },
  };
};

/**
 * Create an anonymous session
 */
export const createAnonymousSession = (): Session => {
  return {
    user: createAnonymousUser(),
    access_token: '',
    expires_in: Number.MAX_SAFE_INTEGER,
    expires_at: Number.MAX_SAFE_INTEGER,
  };
};
