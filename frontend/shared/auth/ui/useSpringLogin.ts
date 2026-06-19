import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { springAuth } from "@shared/auth/spring/springAuthClient";
import { getSpringAuthConfig } from "@shared/auth/config";
import type { OAuthProvider } from "@shared/auth/spring/oauthTypes";

/**
 * Shape of the backend's `/api/v1/proprietary/ui-data/login` response. Only the
 * fields the login screen reads are typed; the editor consumes the extra ones
 * (auto-login, first-time setup, languages) via the onConfigLoaded callback.
 */
export interface SpringLoginUiData {
  enableLogin?: boolean;
  loginMethod?: string;
  providerList?: Record<string, unknown>;
  ssoAutoLogin?: boolean;
  firstTimeSetup?: boolean;
  showDefaultCredentials?: boolean;
  languages?: string[] | null;
  defaultLocale?: string | null;
}

export interface UseSpringLoginOptions {
  /**
   * Gate the config fetch. The portal fetches immediately (default true); the
   * editor waits until its backend probe reports the backend is reachable.
   */
  ready?: boolean;
  /** Receives the full login-ui-data response after each successful fetch. */
  onConfigLoaded?: (data: SpringLoginUiData) => void;
  /** Run at the start of any sign-in attempt (email or OAuth). */
  onSignInStart?: () => void;
  /** Run just before an OAuth redirect (e.g. stash the post-login return path). */
  onBeforeOAuth?: (provider: OAuthProvider) => void;
  /** OAuth callback URL; defaults to `${basePath}/auth/callback`. */
  redirectTo?: string;
}

export interface SpringLoginState {
  email: string;
  setEmail: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  mfaCode: string;
  setMfaCode: (value: string) => void;
  requiresMfa: boolean;
  error: string | null;
  setError: (value: string | null) => void;
  isSubmitting: boolean;
  providers: OAuthProvider[];
  loginMethod: string;
  isUserPassAllowed: boolean;
  hasProviders: boolean;
  signInWithEmail: () => Promise<void>;
  signInWithProvider: (provider: OAuthProvider) => Promise<void>;
}

/**
 * Owns the Spring login form's state, config fetch, and sign-in handlers so the
 * editor and portal share one implementation. Host-specific behaviour (the
 * editor's auto-login, redirects, first-time-setup hint) is layered on via the
 * options callbacks rather than baked in here.
 */
export function useSpringLogin(
  options: UseSpringLoginOptions = {},
): SpringLoginState {
  const { ready = true } = options;
  const { t } = useTranslation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [requiresMfa, setRequiresMfa] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [providers, setProviders] = useState<OAuthProvider[]>([]);
  const [loginMethod, setLoginMethod] = useState("all");

  // Keep callbacks current without re-running the fetch effect on every render.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await getSpringAuthConfig().http.get(
          "/api/v1/proprietary/ui-data/login",
        );
        if (cancelled) return;
        const data = (response.data ?? {}) as SpringLoginUiData;
        setProviders(Object.keys(data.providerList ?? {}));
        setLoginMethod(data.loginMethod ?? "all");
        optionsRef.current.onConfigLoaded?.(data);
      } catch (err) {
        if (cancelled) return;
        console.error("[useSpringLogin] Failed to load login config:", err);
        setProviders([]);
        setLoginMethod("all");
        optionsRef.current.onConfigLoaded?.({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready]);

  const signInWithEmail = useCallback(async () => {
    if (!email || !password) {
      setError(
        t("login.pleaseEnterBoth", "Please enter both email and password"),
      );
      return;
    }
    if (requiresMfa && !mfaCode.trim()) {
      setError(t("login.mfaRequired", "Two-factor code required"));
      return;
    }
    try {
      setIsSubmitting(true);
      setError(null);
      optionsRef.current.onSignInStart?.();
      const {
        user,
        session,
        error: signInError,
      } = await springAuth.signInWithPassword({
        email: email.trim(),
        password,
        mfaCode: requiresMfa ? mfaCode.trim() : undefined,
      });
      if (signInError) {
        setError(signInError.message);
        if (
          signInError.mfaRequired ||
          signInError.code === "invalid_mfa_code"
        ) {
          setRequiresMfa(true);
        }
      } else if (user && session) {
        setRequiresMfa(false);
        setMfaCode("");
        // Auth state updates via the provider; the host handles post-login nav.
      }
    } catch (err) {
      setError(
        t("login.unexpectedError", {
          defaultValue: "Unexpected error: {{message}}",
          message: err instanceof Error ? err.message : "Unknown error",
        }),
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [email, password, mfaCode, requiresMfa, t]);

  const signInWithProvider = useCallback(
    async (provider: OAuthProvider) => {
      try {
        setIsSubmitting(true);
        setError(null);
        optionsRef.current.onSignInStart?.();
        optionsRef.current.onBeforeOAuth?.(provider);
        const { error: oauthError } = await springAuth.signInWithOAuth({
          provider,
          options: {
            redirectTo:
              optionsRef.current.redirectTo ??
              `${getSpringAuthConfig().basePath}/auth/callback`,
          },
        });
        if (oauthError) {
          setError(
            t("login.failedToSignIn", {
              defaultValue: "Failed to sign in with {{provider}}: {{message}}",
              provider,
              message: oauthError.message,
            }),
          );
        }
      } catch (err) {
        setError(
          t("login.unexpectedError", {
            defaultValue: "Unexpected error: {{message}}",
            message: err instanceof Error ? err.message : "Unknown error",
          }),
        );
      } finally {
        setIsSubmitting(false);
      }
    },
    [t],
  );

  const isUserPassAllowed = loginMethod === "all" || loginMethod === "normal";

  return {
    email,
    setEmail,
    password,
    setPassword,
    mfaCode,
    setMfaCode,
    requiresMfa,
    error,
    setError,
    isSubmitting,
    providers,
    loginMethod,
    isUserPassAllowed,
    hasProviders: providers.length > 0,
    signInWithEmail,
    signInWithProvider,
  };
}
