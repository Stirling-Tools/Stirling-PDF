import { createContext, PropsWithChildren, useContext } from 'react';

export interface User {
  id?: string;
  email?: string;
  username?: string;
  role?: string;
  enabled?: boolean;
  is_anonymous?: boolean;
  app_metadata?: Record<string, unknown>;
}

export interface Session {
  user: User | null;
  access_token?: string;
  expires_in?: number;
  expires_at?: number;
}

export interface AuthError {
  message?: string;
  status?: number;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  error: AuthError | null;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const defaultValue: AuthContextValue = {
  session: null,
  user: null,
  loading: false,
  error: null,
  signOut: async () => {},
  refreshSession: async () => {},
};

const AuthContext = createContext<AuthContextValue>(defaultValue);

export function AuthProvider({ children }: PropsWithChildren) {
  return (
    <AuthContext.Provider value={defaultValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

export function useAuthDebug(): AuthContextValue {
  return useAuth();
}
