/**
 * Basic Supabase-backed auth provider feeding the unified AuthContext.
 *
 * This is the portable provider used by the shared unified auth (e.g. the
 * portal in Supabase mode). It deliberately does NOT carry the editor saas
 * build's extras (pro status, profile pictures, teams) - those remain in the
 * editor's saas layer. It maps a Supabase session onto the provider-agnostic
 * AuthUser/AuthSession shapes and exposes the same useAuth() contract as the
 * Spring provider.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import type {
  Session as SbSession,
  User as SbUser,
} from "@supabase/supabase-js";
import { getSupabaseClient } from "@shared/auth/supabase/supabaseClient";
import { AuthContext } from "@shared/auth/context";
import { isAdminRole } from "@shared/auth/roles";
import {
  defaultTranslate,
  type AuthContextValue,
  type AuthError,
  type AuthSession,
  type AuthUser,
  type AuthTranslate,
} from "@shared/auth/types";

function readRole(user: SbUser): string {
  const appRole = (user.app_metadata as { role?: unknown } | undefined)?.role;
  if (typeof appRole === "string") return appRole;
  return "USER";
}

function mapUser(user: SbUser): AuthUser {
  const metadata = user.user_metadata as
    | { full_name?: string; name?: string; username?: string }
    | undefined;
  return {
    id: user.id,
    email: user.email ?? "",
    username:
      metadata?.username ||
      metadata?.full_name ||
      metadata?.name ||
      user.email ||
      "",
    role: readRole(user),
    is_anonymous: user.is_anonymous,
    app_metadata: user.app_metadata as Record<string, unknown>,
  };
}

function mapSession(session: SbSession | null): AuthSession | null {
  if (!session) return null;
  return {
    user: mapUser(session.user),
    access_token: session.access_token,
    expires_in: session.expires_in,
    expires_at: session.expires_at ? session.expires_at * 1000 : undefined,
  };
}

function deriveDisplayName(
  user: AuthUser | null,
  translate: AuthTranslate,
): string | null {
  if (!user) return null;
  if (user.is_anonymous) return translate("auth.displayName.guest", "Guest");
  return user.username || user.email || null;
}

export interface SupabaseAuthProviderProps {
  children: ReactNode;
  translate?: AuthTranslate;
}

export function SupabaseAuthProvider({
  children,
  translate = defaultTranslate,
}: SupabaseAuthProviderProps) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AuthError | null>(null);

  const refreshSession = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setLoading(true);
    const { data, error } = await supabase.auth.refreshSession();
    if (error) {
      setError({ message: error.message });
      setSession(null);
    } else {
      setSession(mapSession(data.session));
    }
    setLoading(false);
  }, []);

  const signOut = useCallback(async () => {
    const supabase = getSupabaseClient();
    setSession(null);
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) setError({ message: error.message });
  }, []);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      // Supabase mode requested but not configured - settle into a signed-out
      // state instead of hanging on "loading".
      setLoading(false);
      return;
    }

    let mounted = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        setSession(mapSession(data.session));
      })
      .catch((e: unknown) => {
        if (mounted) setError({ message: String(e) });
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mounted) return;
      setSession(mapSession(newSession));
      setError(null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const user = session?.user ?? null;
  const value: AuthContextValue = {
    session,
    user,
    displayName: deriveDisplayName(user, translate),
    isAnonymous: user?.is_anonymous === true,
    isAdmin: isAdminRole(user?.role),
    role: user?.role ?? null,
    loading,
    error,
    signOut,
    refreshSession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
