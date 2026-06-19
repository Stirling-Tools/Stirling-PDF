import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import EmailPasswordForm from "@shared/auth/ui/EmailPasswordForm";
import OAuthButtons from "@shared/auth/ui/OAuthButtons";
import ErrorMessage from "@shared/auth/ui/ErrorMessage";
import {
  springAuth,
  getSpringAuthConfig,
  type OAuthProvider,
} from "@shared/auth";
import markLight from "@shared/assets/stirling-mark-light.svg";
import "@portal/components/LoginScreen.css";

interface LoginUiData {
  enableLogin?: boolean;
  loginMethod?: string;
  providerList?: Record<string, unknown>;
}

/**
 * Full-screen login shown by the auth gate when no session is present. Composes
 * the same login components the editor uses (shared @shared/auth/ui), driven by
 * the shared Spring auth client. On success the gate re-evaluates and either
 * reveals the portal (admin) or redirects to the editor (non-admin).
 */
export function LoginScreen() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [requiresMfa, setRequiresMfa] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [providers, setProviders] = useState<OAuthProvider[]>([]);
  const [loginMethod, setLoginMethod] = useState("all");

  const isUserPassAllowed = loginMethod === "all" || loginMethod === "normal";
  const hasProviders = providers.length > 0;

  // Auth pages render in light mode (the shared form uses light-only tokens).
  useEffect(() => {
    const html = document.documentElement;
    const previous = html.getAttribute("data-mantine-color-scheme");
    html.setAttribute("data-mantine-color-scheme", "light");
    return () => {
      if (previous) html.setAttribute("data-mantine-color-scheme", previous);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    getSpringAuthConfig()
      .http.get("/api/v1/proprietary/ui-data/login")
      .then((response) => {
        if (!mounted) return;
        const data = (response.data ?? {}) as LoginUiData;
        setProviders(Object.keys(data.providerList ?? {}));
        setLoginMethod(data.loginMethod ?? "all");
      })
      .catch(() => {
        if (mounted) {
          setProviders([]);
          setLoginMethod("all");
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const signInWithEmail = async () => {
    if (!email || !password) {
      setError(
        t("login.pleaseEnterBoth", "Please enter both username and password"),
      );
      return;
    }
    try {
      setSubmitting(true);
      setError(null);
      const { user, session, error } = await springAuth.signInWithPassword({
        email: email.trim(),
        password,
        mfaCode: requiresMfa ? mfaCode.trim() : undefined,
      });
      if (error) {
        setError(error.message);
        if (error.mfaRequired || error.code === "invalid_mfa_code") {
          setRequiresMfa(true);
        }
      } else if (user && session) {
        setRequiresMfa(false);
        setMfaCode("");
        // Auth state updates via the provider; the gate re-evaluates.
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const signInWithProvider = async (provider: OAuthProvider) => {
    try {
      setSubmitting(true);
      setError(null);
      const { error } = await springAuth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${getSpringAuthConfig().basePath}/auth/callback`,
        },
      });
      if (error) setError(error.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Single sign-on failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="portal-login">
      <div className="portal-login__card">
        <img className="portal-login__mark" src={markLight} alt="Stirling" />
        <h1 className="portal-login__title">{t("login.title", "Sign in")}</h1>
        <p className="portal-login__subtitle">
          Sign in to the Stirling admin portal
        </p>

        <ErrorMessage error={error} />

        {hasProviders && (
          <OAuthButtons
            onProviderClick={signInWithProvider}
            isSubmitting={submitting}
            layout="vertical"
            enabledProviders={providers}
            styleVariant="light"
          />
        )}

        {isUserPassAllowed && (
          <EmailPasswordForm
            email={email}
            password={password}
            setEmail={setEmail}
            setPassword={setPassword}
            mfaCode={mfaCode}
            setMfaCode={setMfaCode}
            showMfaField={requiresMfa || Boolean(mfaCode)}
            requiresMfa={requiresMfa}
            onSubmit={signInWithEmail}
            isSubmitting={submitting}
            submitButtonText={
              submitting
                ? t("login.loggingIn", "Signing in…")
                : t("login.login", "Sign in")
            }
          />
        )}
      </div>
    </div>
  );
}
