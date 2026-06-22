/**
 * Unified auth provider. Selects the Spring (self-hosted JWT) or Supabase
 * (cloud) backend by `mode` and feeds the single shared AuthContext, so
 * consumers read `useAuth()` identically either way.
 */
import { lazy, Suspense, type ReactNode } from "react";
import { SpringAuthProvider } from "@shared/auth/spring/UseSession";
import { type AuthMode, type AuthTranslate } from "@shared/auth/types";

// Lazy so Spring-mode hosts (e.g. the portal) don't bundle @supabase/supabase-js
// they never use; only loaded when mode="supabase".
const SupabaseAuthProvider = lazy(() =>
  import("@shared/auth/supabase/UseSession").then((m) => ({
    default: m.SupabaseAuthProvider,
  })),
);

export interface AuthProviderProps {
  children: ReactNode;
  /** Which backend to authenticate against. Defaults to "spring". */
  mode?: AuthMode;
  /** Optional i18n translate for user-facing copy (defaults to English). */
  translate?: AuthTranslate;
}

export function AuthProvider({
  children,
  mode = "spring",
  translate,
}: AuthProviderProps) {
  if (mode === "supabase") {
    return (
      <Suspense fallback={null}>
        <SupabaseAuthProvider translate={translate}>
          {children}
        </SupabaseAuthProvider>
      </Suspense>
    );
  }
  return (
    <SpringAuthProvider translate={translate}>{children}</SpringAuthProvider>
  );
}
