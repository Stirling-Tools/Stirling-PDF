import { createContext, useContext, type ReactNode } from 'react';

interface AuthContextValue {
  session: null;
  user: null;
  loading: boolean;
  error: null;
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

export function AuthProvider({ children }: { children: ReactNode }) {
  return <AuthContext.Provider value={defaultValue}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

export function useAuthDebug(): AuthContextValue {
  return useAuth();
}

