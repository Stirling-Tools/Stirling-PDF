export interface User {
  id: string;
  email: string;
  username: string;
  role: string;
  enabled?: boolean;
  is_anonymous?: boolean;
  isFirstLogin?: boolean;
  app_metadata?: Record<string, any>;
}

export interface Session {
  user: User;
  access_token: string;
  expires_in: number;
  expires_at?: number;
}

export interface AuthError {
  message: string;
  status?: number;
}

export interface AuthResponse {
  user: User | null;
  session: Session | null;
  error: AuthError | null;
}

export type AuthChangeEvent =
  | 'SIGNED_IN'
  | 'SIGNED_OUT'
  | 'TOKEN_REFRESHED'
  | 'USER_UPDATED';

export type AuthChangeCallback = (event: AuthChangeEvent, session: Session | null) => void;

export interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  error: AuthError | null;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
}
