import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import EmailPasswordForm from "@shared/auth/ui/EmailPasswordForm";
import OAuthButtons from "@shared/auth/ui/OAuthButtons";
import ErrorMessage from "@shared/auth/ui/ErrorMessage";
import { AuthShell } from "@shared/auth/ui/AuthShell";
import LoginRightCarousel from "@shared/auth/ui/LoginRightCarousel";
import { buildDefaultLoginSlides } from "@shared/auth/ui/loginSlides";
import {
  springAuth,
  getSpringAuthConfig,
  type OAuthProvider,
} from "@shared/auth";
import "@shared/auth/ui/auth-theme.css";
import "@shared/auth/ui/auth.css";
import loginHeader from "@shared/assets/login/LoginLightModeHeader.svg";

interface LoginUiData {
  enableLogin?: boolean;
  loginMethod?: string;
  providerList?: Record<string, unknown>;
}

const dividerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.75rem",
  margin: "0.75rem 0",
  color: "var(--auth-label-text-light-only)",
  fontSize: "0.8125rem",
  opacity: 0.7,
};
const lineStyle: CSSProperties = {
  flex: 1,
  height: 1,
  background: "currentColor",
  opacity: 0.4,
};

/**
 * Full-screen login shown by the auth gate. Renders the same screen as the
 * editor - the shared AuthShell + carousel from @shared/auth/ui, with the form
 * built from the shared auth atoms - driven by the shared Spring auth client.
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
  const slides = useMemo(
    () => buildDefaultLoginSlides((key, fallback) => t(key, fallback)),
    [t],
  );

  // Auth pages render in light mode (the shared screen uses light-only tokens).
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
    <AuthShell
      rightPanel={
        <LoginRightCarousel
          imageSlides={slides}
          initialSeconds={5}
          slideSeconds={8}
        />
      }
    >
      <div className="auth-logo-block">
        <img
          src={loginHeader}
          alt="Stirling PDF"
          className="auth-logo-header auth-logo-header--light"
        />
      </div>

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

      {hasProviders && isUserPassAllowed && (
        <div style={dividerStyle}>
          <span style={lineStyle} aria-hidden />
          {t("signup.or", "or")}
          <span style={lineStyle} aria-hidden />
        </div>
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
    </AuthShell>
  );
}
