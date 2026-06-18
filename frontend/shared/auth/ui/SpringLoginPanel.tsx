/**
 * Self-contained Spring login panel built from the shared design system.
 *
 * Unlike the editor's branded login route (carousel, i18n, backend probe), this
 * is dependency-light: no react-i18next, no editor contexts. It drives the
 * shared Spring auth client directly, so on success the unified AuthContext
 * updates and the surrounding gate swaps to the app. Used by the portal; usable
 * by any app that wants a no-frills Spring login.
 */
import { useEffect, useState, type CSSProperties } from "react";
import { Banner, Button, FormField, Input } from "@shared/components";
import { springAuth } from "@shared/auth/spring/springAuthClient";
import { getSpringAuthConfig } from "@shared/auth/config";
import type { OAuthProvider } from "@shared/auth/spring/oauthTypes";

export interface SpringLoginLabels {
  title: string;
  subtitle: string;
  usernameLabel: string;
  usernamePlaceholder: string;
  passwordLabel: string;
  passwordPlaceholder: string;
  mfaLabel: string;
  mfaPlaceholder: string;
  submit: string;
  submitting: string;
  ssoPrefix: string;
  orDivider: string;
}

const DEFAULT_LABELS: SpringLoginLabels = {
  title: "Sign in",
  subtitle: "Use your Stirling account to continue",
  usernameLabel: "Username",
  usernamePlaceholder: "Enter username",
  passwordLabel: "Password",
  passwordPlaceholder: "Enter password",
  mfaLabel: "Authentication code",
  mfaPlaceholder: "Enter 6-digit code",
  submit: "Sign in",
  submitting: "Signing in…",
  ssoPrefix: "Sign in with",
  orDivider: "or",
};

interface LoginUiData {
  enableLogin?: boolean;
  loginMethod?: string;
  providerList?: Record<string, unknown>;
}

const PROVIDER_LABELS: Record<string, string> = {
  google: "Google",
  github: "GitHub",
  apple: "Apple",
  azure: "Microsoft",
  keycloak: "Keycloak",
  cloudron: "Cloudron",
  authentik: "Authentik",
  oidc: "OIDC",
};

function providerLabel(pathOrId: string): string {
  const id = pathOrId.split("/").pop() || pathOrId;
  return PROVIDER_LABELS[id] ?? id.charAt(0).toUpperCase() + id.slice(1);
}

export interface SpringLoginPanelProps {
  labels?: Partial<SpringLoginLabels>;
  /** Called after a successful username/password sign-in. */
  onAuthenticated?: () => void;
  className?: string;
}

const wrapStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
  width: "100%",
  maxWidth: "22rem",
};

const dividerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.75rem",
  color: "var(--color-text-4)",
  fontSize: "0.8125rem",
};

const lineStyle: CSSProperties = {
  flex: 1,
  height: 1,
  background: "var(--color-border, rgba(127,127,127,0.25))",
};

export function SpringLoginPanel({
  labels,
  onAuthenticated,
  className,
}: SpringLoginPanelProps) {
  const text = { ...DEFAULT_LABELS, ...labels };

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

  useEffect(() => {
    let mounted = true;
    const fetchProviders = async () => {
      try {
        const response = await getSpringAuthConfig().http.get(
          "/api/v1/proprietary/ui-data/login",
        );
        if (!mounted) return;
        const data = (response.data ?? {}) as LoginUiData;
        setProviders(Object.keys(data.providerList ?? {}));
        setLoginMethod(data.loginMethod ?? "all");
      } catch {
        // Backend without the proprietary login endpoint (or offline): fall
        // back to username/password only.
        if (mounted) {
          setProviders([]);
          setLoginMethod("all");
        }
      }
    };
    void fetchProviders();
    return () => {
      mounted = false;
    };
  }, []);

  const signInWithEmail = async () => {
    if (!email || !password) {
      setError("Please enter both username and password");
      return;
    }
    if (requiresMfa && !mfaCode.trim()) {
      setError("Two-factor code required");
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
        onAuthenticated?.();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  const signInWithProvider = async (provider: OAuthProvider) => {
    try {
      setSubmitting(true);
      setError(null);
      const basePath = getSpringAuthConfig().basePath;
      const { error } = await springAuth.signInWithOAuth({
        provider,
        options: { redirectTo: `${basePath}/auth/callback` },
      });
      if (error) setError(error.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Single sign-on failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={wrapStyle} className={className}>
      <div>
        <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 700 }}>
          {text.title}
        </h1>
        <p style={{ margin: "0.25rem 0 0", color: "var(--color-text-3)" }}>
          {text.subtitle}
        </p>
      </div>

      {error && <Banner tone="danger" description={error} />}

      {hasProviders && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {providers.map((p) => (
            <Button
              key={p}
              variant="outline"
              fullWidth
              disabled={submitting}
              onClick={() => void signInWithProvider(p)}
            >
              {`${text.ssoPrefix} ${providerLabel(p)}`}
            </Button>
          ))}
        </div>
      )}

      {hasProviders && isUserPassAllowed && (
        <div style={dividerStyle}>
          <span style={lineStyle} aria-hidden />
          {text.orDivider}
          <span style={lineStyle} aria-hidden />
        </div>
      )}

      {isUserPassAllowed && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void signInWithEmail();
          }}
          style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
        >
          <FormField label={text.usernameLabel}>
            <Input
              name="username"
              autoComplete="username"
              placeholder={text.usernamePlaceholder}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
          </FormField>

          <FormField label={text.passwordLabel}>
            <Input
              type="password"
              name="current-password"
              autoComplete="current-password"
              placeholder={text.passwordPlaceholder}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </FormField>

          {(requiresMfa || mfaCode) && (
            <FormField label={text.mfaLabel}>
              <Input
                name="mfaCode"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder={text.mfaPlaceholder}
                value={mfaCode}
                maxLength={6}
                onChange={(e) =>
                  setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
              />
            </FormField>
          )}

          <Button
            type="submit"
            fullWidth
            loading={submitting}
            disabled={submitting || !email || !password}
          >
            {submitting ? text.submitting : text.submit}
          </Button>
        </form>
      )}
    </div>
  );
}
