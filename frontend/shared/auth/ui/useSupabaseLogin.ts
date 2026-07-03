import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Provider } from "@supabase/supabase-js";
import { getSupabaseClient } from "@shared/auth/supabase/supabaseClient";

/**
 * Supabase counterpart to {@link useSpringLogin}: owns a login form's state and
 * sign-in handlers, wired to the shared Supabase client ({@link configureSupabase}).
 * Kept out of the `@shared/auth` barrel (like the rest of the Supabase path) so
 * Spring-only consumers don't pull in `@supabase/supabase-js`; import via the
 * subpath.
 *
 * Email/password resolves inline and fires {@link UseSupabaseLoginOptions.onSuccess}.
 * OAuth triggers a full-page redirect to the provider; the session arrives on
 * return (the host completes the flow from the Supabase auth-state change).
 */

export interface SupabaseLoginSession {
  /** Supabase access token (JWT) the caller hands to its backend. */
  access_token: string;
}

export interface UseSupabaseLoginOptions {
  /** OAuth provider ids to surface (e.g. "google", "github", "apple", "azure"). */
  providers?: string[];
  /** OAuth return URL. The Supabase project must allow-list it. */
  redirectTo?: string;
  /** Run just before an OAuth redirect (e.g. stash a pending-link marker). */
  onBeforeOAuth?: (provider: string) => void;
  /** Receives the session after a successful email/password sign-in. */
  onSuccess?: (session: SupabaseLoginSession) => void | Promise<void>;
}

export interface SupabaseLoginState {
  email: string;
  setEmail: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  error: string | null;
  setError: (value: string | null) => void;
  isSubmitting: boolean;
  providers: string[];
  hasProviders: boolean;
  signInWithEmail: () => Promise<void>;
  signInWithProvider: (provider: string) => Promise<void>;
}

const NOT_CONFIGURED_KEY = "auth.supabaseUnconfigured";
const NOT_CONFIGURED_FALLBACK =
  "Account login is unavailable — Supabase is not configured.";

export function useSupabaseLogin(
  options: UseSupabaseLoginOptions = {},
): SupabaseLoginState {
  const { providers = [], redirectTo, onBeforeOAuth, onSuccess } = options;
  const { t } = useTranslation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const signInWithEmail = useCallback(async () => {
    if (!email || !password) {
      setError(
        t("login.pleaseEnterBoth", "Please enter both email and password"),
      );
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError(t(NOT_CONFIGURED_KEY, NOT_CONFIGURED_FALLBACK));
      return;
    }
    try {
      setIsSubmitting(true);
      setError(null);
      const { data, error: signInError } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
      if (signInError) {
        setError(signInError.message);
      } else if (data.session) {
        await onSuccess?.({ access_token: data.session.access_token });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  }, [email, password, onSuccess, t]);

  const signInWithProvider = useCallback(
    async (provider: string) => {
      const supabase = getSupabaseClient();
      if (!supabase) {
        setError(t(NOT_CONFIGURED_KEY, NOT_CONFIGURED_FALLBACK));
        return;
      }
      try {
        setIsSubmitting(true);
        setError(null);
        onBeforeOAuth?.(provider);
        const { error: oauthError } = await supabase.auth.signInWithOAuth({
          provider: provider as Provider,
          options: redirectTo ? { redirectTo } : undefined,
        });
        if (oauthError) setError(oauthError.message);
        // Success path redirects the browser; the session arrives on return.
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsSubmitting(false);
      }
    },
    [onBeforeOAuth, redirectTo, t],
  );

  return {
    email,
    setEmail,
    password,
    setPassword,
    error,
    setError,
    isSubmitting,
    providers,
    hasProviders: providers.length > 0,
    signInWithEmail,
    signInWithProvider,
  };
}
