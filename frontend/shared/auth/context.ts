/**
 * The single React context backing `useAuth()`. Both the Spring and Supabase
 * providers write to this same context so consumers read a unified value
 * regardless of which backend authenticated the user.
 */
import { createContext, useContext } from "react";
import type { AuthContextValue } from "@shared/auth/types";

export const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  displayName: null,
  isAnonymous: false,
  isAdmin: false,
  role: null,
  loading: true,
  error: null,
  signOut: async () => {},
  refreshSession: async () => {},
});

/** Access the current auth state. Must be used within an AuthProvider. */
export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
