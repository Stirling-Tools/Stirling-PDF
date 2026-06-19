import { useCallback, useEffect, useState } from "react";
import {
  getSession,
  isSupabaseConfigured,
  signIn,
  signOut,
  signUp,
  type Session,
} from "@portal/auth/supabaseLink";
import {
  registerInstance,
  type RegisterInstanceResponse,
} from "@portal/api/link";
import { useApplyLinkFacts } from "@portal/contexts/LinkContext";

/**
 * Orchestrates the account-link flow: sign in / sign up against the SaaS Supabase
 * project, then POST the session to the org's local backend to register this
 * instance. On success the one-time device secret is held in state for the UI to
 * surface, and {@link useApplyLinkFacts} marks the org as linked.
 *
 * Supabase config may be absent in this repo (see auth/supabaseLink.ts). When it
 * is, sign-in is unavailable but registration still works in dev against MSW with
 * a placeholder token — the surface degrades to "configure Supabase to go live".
 */

export type LinkPhase = "idle" | "working" | "registered" | "error";

export interface UseAccountLink {
  supabaseConfigured: boolean;
  /** Current SaaS session, once signed in. */
  session: Session | null;
  phase: LinkPhase;
  error: string | null;
  /** The one-time credential from a successful registration; clear after the user copies it. */
  credential: RegisterInstanceResponse | null;
  authenticate: (
    mode: "signin" | "signup",
    email: string,
    password: string,
  ) => Promise<void>;
  /** Register this instance against the (already authenticated) SaaS team. */
  register: (name?: string) => Promise<void>;
  /** Dismiss the displayed one-time credential. */
  clearCredential: () => void;
  logout: () => Promise<void>;
}

export function useAccountLink(): UseAccountLink {
  const applyLinkFacts = useApplyLinkFacts();
  const [session, setSession] = useState<Session | null>(null);
  const [phase, setPhase] = useState<LinkPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [credential, setCredential] = useState<RegisterInstanceResponse | null>(
    null,
  );

  // Pick up an existing SaaS session on mount (no-op when unconfigured).
  useEffect(() => {
    let cancelled = false;
    void getSession().then((s) => {
      if (!cancelled) setSession(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const authenticate = useCallback(
    async (mode: "signin" | "signup", email: string, password: string) => {
      setPhase("working");
      setError(null);
      try {
        const s =
          mode === "signin"
            ? await signIn(email, password)
            : await signUp(email, password);
        setSession(s);
        setPhase("idle");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setPhase("error");
      }
    },
    [],
  );

  const register = useCallback(
    async (name?: string) => {
      setPhase("working");
      setError(null);
      try {
        const cred = await registerInstance(
          session?.access_token ?? null,
          name ? { name } : {},
        );
        setCredential(cred);
        setPhase("registered");
        // Newly linked; subscription state is resolved separately from the wallet.
        applyLinkFacts(true, false);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setPhase("error");
      }
    },
    [session, applyLinkFacts],
  );

  const clearCredential = useCallback(() => setCredential(null), []);

  const logout = useCallback(async () => {
    await signOut();
    setSession(null);
    setPhase("idle");
  }, []);

  return {
    supabaseConfigured: isSupabaseConfigured,
    session,
    phase,
    error,
    credential,
    authenticate,
    register,
    clearCredential,
    logout,
  };
}
