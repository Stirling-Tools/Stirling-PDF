import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, signInAnonymously } from "@app/auth/supabase";
import { useAuth } from "@app/auth/UseSession";
import { useTranslation } from "@app/hooks/useTranslation";
import { useDocumentMeta } from "@app/hooks/useDocumentMeta";
import AuthLayout from "@app/routes/authShared/AuthLayout";
import "@shared/auth/ui/auth.css";
import "@app/routes/authShared/saas-auth.css";
import {
  absoluteWithBasePath,
  getBaseUrl,
  withBasePath,
} from "@app/constants/app";
import LinkRoundedIcon from "@mui/icons-material/LinkRounded";

// Import login components
import ErrorMessage from "@shared/auth/ui/ErrorMessage";
import EmailPasswordForm from "@app/routes/login/EmailPasswordForm";
import OAuthButtons from "@app/routes/login/OAuthButtons";
import LoggedInState from "@app/routes/login/LoggedInState";
import loginHeader from "@shared/assets/brand/modern-logo/LoginLightModeHeader.svg";

export default function Login() {
  const navigate = useNavigate();
  const { session, loading, refreshSession } = useAuth();
  const { t } = useTranslation();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMagicLinkForm, setShowMagicLinkForm] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [magicLinkEmail, setMagicLinkEmail] = useState("");
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  // Prefill email from query param (e.g. after password reset)
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const emailFromQuery = url.searchParams.get("email");
      if (emailFromQuery) {
        setEmail(emailFromQuery);
        setShowEmailForm(true);
      }
    } catch (_) {
      // ignore
    }
  }, []);

  // Same-origin relative path to return to after login (e.g. the OAuth
  // consent page). Same sanitization rules as AuthCallback's `next`.
  const nextPath = useMemo(() => {
    try {
      const next = new URL(window.location.href).searchParams.get("next");
      return next && next.startsWith("/") && !next.startsWith("//")
        ? next
        : null;
    } catch (_) {
      return null;
    }
  }, []);

  useEffect(() => {
    if (session && !loading && nextPath) {
      navigate(nextPath, { replace: true });
    }
  }, [session, loading, nextPath, navigate]);

  const baseUrl = getBaseUrl();

  // Set document meta
  useDocumentMeta({
    title: `${t("login.title", "Sign in")} - Stirling PDF`,
    description: t(
      "app.description",
      "The Free Adobe Acrobat alternative (10M+ Downloads)",
    ),
    ogTitle: `${t("login.title", "Sign in")} - Stirling PDF`,
    ogDescription: t(
      "app.description",
      "The Free Adobe Acrobat alternative (10M+ Downloads)",
    ),
    ogImage: `${baseUrl}/og_images/home.png`,
    ogUrl: `${window.location.origin}${window.location.pathname}`,
  });

  // Show logged in state if authenticated (unless bouncing back to `next`)
  if (session && !loading) {
    if (nextPath) {
      return null;
    }
    return <LoggedInState />;
  }

  const signInWithProvider = async (
    provider: "github" | "google" | "apple" | "azure",
  ) => {
    try {
      setIsSigningIn(true);
      setError(null);

      const redirectTo =
        absoluteWithBasePath("/auth/callback") +
        (nextPath ? `?next=${encodeURIComponent(nextPath)}` : "");
      console.log(`[Login] Signing in with ${provider}`);

      const oauthOptions: {
        redirectTo: string;
        queryParams?: Record<string, string>;
      } = { redirectTo };
      if (provider === "apple") {
        oauthOptions.queryParams = { scope: "email name" };
      } else if (provider === "azure") {
        oauthOptions.queryParams = { scope: "openid profile email" };
      } else {
        oauthOptions.queryParams = {
          access_type: "offline",
          prompt: "consent",
        };
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: oauthOptions,
      });

      if (error) {
        console.error(`[Login] ${provider} error:`, error);
        setError(
          t("login.failedToSignIn", { provider, message: error.message }),
        );
      }
    } catch (err) {
      console.error(`[Login] Unexpected error:`, err);
      setError(
        t("login.unexpectedError", {
          message: err instanceof Error ? err.message : "Unknown error",
        }),
      );
    } finally {
      setIsSigningIn(false);
    }
  };

  const signInWithEmail = async () => {
    if (!email || !password) {
      setError(t("login.pleaseEnterBoth"));
      return;
    }

    try {
      setIsSigningIn(true);
      setError(null);

      console.log("[Login] Signing in with email:", email);

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });

      if (error) {
        console.error("[Login] Email sign in error:", error);
        setError(error.message);
      } else if (data.user) {
        console.log("[Login] Email sign in successful");
        // User will be redirected by the auth state change
      }
    } catch (err) {
      console.error("[Login] Unexpected error]:", err);
      setError(
        t("login.unexpectedError", {
          message: err instanceof Error ? err.message : "Unknown error",
        }),
      );
    } finally {
      setIsSigningIn(false);
    }
  };

  const signInWithMagicLink = async () => {
    if (!magicLinkEmail) {
      setError(t("login.pleaseEnterEmail"));
      return;
    }

    try {
      setIsSigningIn(true);
      setError(null);

      console.log("[Login] Sending magic link to:", magicLinkEmail);

      const { error } = await supabase.auth.signInWithOtp({
        email: magicLinkEmail.trim(),
        options: {
          emailRedirectTo:
            absoluteWithBasePath("/auth/callback") +
            (nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""),
        },
      });

      if (error) {
        console.error("[Login] Magic link error:", error);
        setError(error.message);
      } else {
        setError(null);
        setMagicLinkSent(true);
      }
    } catch (err) {
      setError(
        t("login.unexpectedError", {
          message: err instanceof Error ? err.message : "Unknown error",
        }),
      );
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleAnonymousSignIn = async () => {
    try {
      setIsSigningIn(true);
      setError(null);
      console.log("[Login] Signing in anonymously");

      const { data } = await signInAnonymously();

      if (data.user) {
        console.log(
          "[Login] Anonymous sign in successful, refreshing session...",
        );

        // Refresh session to ensure backend endpoints are properly synchronized
        await refreshSession();

        console.log(
          "[Login] Session refreshed, user will be redirected by auth state change",
        );
        // User will be redirected by the auth state change after session refresh
      }
    } catch (err) {
      console.error("[Login] Unexpected error:", err);
      setError(
        t("login.unexpectedError", {
          message: err instanceof Error ? err.message : "Unknown error",
        }),
      );
    } finally {
      setIsSigningIn(false);
    }
  };

  const toggleEmailForm = () => {
    setShowEmailForm((v) => !v);
    setShowMagicLinkForm(false);
    setMagicLinkSent(false);
  };

  const toggleMagicLink = () => {
    setShowMagicLinkForm((v) => !v);
    setShowEmailForm(false);
    setMagicLinkSent(false);
  };

  return (
    <AuthLayout isEmailFormExpanded={showEmailForm || showMagicLinkForm}>
      {/* Centered logo */}
      <div className="auth-logo-block">
        <img
          src={loginHeader}
          alt="Stirling PDF"
          className="auth-logo-header auth-logo-header--light"
        />
        <img
          src={withBasePath("/modern-logo/LoginDarkModeHeader.svg")}
          alt="Stirling PDF"
          className="auth-logo-header auth-logo-header--dark"
        />
      </div>

      <ErrorMessage error={error} />

      {/* OAuth + magic link group — single flex column so gap is uniform */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
          marginBottom: "2.5rem",
        }}
      >
        <OAuthButtons
          onProviderClick={signInWithProvider}
          isSubmitting={isSigningIn}
          layout="fullwidth"
          labelPrefix={`${t("login.signInWith", "Sign in with")} `}
        />

        {/* Magic link button + its expandable form as one unit */}
        <div>
          <button
            type="button"
            disabled={isSigningIn}
            onClick={toggleMagicLink}
            className={`oauth-button-fullwidth auth-expandable-trigger ${showMagicLinkForm ? "auth-expandable-trigger--active" : ""}`}
          >
            <span className="oauth-btn-group">
              <LinkRoundedIcon
                style={{
                  width: "1.75rem",
                  height: "1.75rem",
                  marginRight: "0.5rem",
                  flexShrink: 0,
                }}
              />
              <span className="oauth-btn-label">
                {t("login.useMagicLink", "Use magic link")}
              </span>
            </span>
          </button>

          <div
            className={`auth-expand-grid ${showMagicLinkForm ? "auth-expand-grid--open" : ""}`}
          >
            <div className="auth-expand-inner">
              <div style={{ paddingTop: "0.25rem" }}>
                {magicLinkSent ? (
                  <p
                    style={{
                      fontSize: "0.875rem",
                      color: "#059669",
                      margin: 0,
                    }}
                  >
                    {t("login.magicLinkSent", { email: magicLinkEmail })}
                  </p>
                ) : (
                  <div className="auth-magic-row">
                    <input
                      type="email"
                      placeholder={t(
                        "login.enterEmailForMagicLink",
                        "Enter your email",
                      )}
                      value={magicLinkEmail}
                      onChange={(e) => setMagicLinkEmail(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" &&
                        !isSigningIn &&
                        signInWithMagicLink()
                      }
                      className="auth-input"
                    />
                    <button
                      onClick={signInWithMagicLink}
                      disabled={isSigningIn || !magicLinkEmail}
                      className="auth-magic-button"
                    >
                      {isSigningIn
                        ? t("login.sending")
                        : t("login.sendMagicLink")}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Email & Password button */}
      <button
        type="button"
        disabled={isSigningIn}
        onClick={toggleEmailForm}
        className={`oauth-button-fullwidth auth-expandable-trigger ${showEmailForm ? "auth-expandable-trigger--active" : ""}`}
        style={{ marginBottom: "0.75rem" }}
      >
        <span className="oauth-btn-group">
          <span className="auth-at-icon">@</span>
          <span className="oauth-btn-label">{`${t("login.signInWith", "Sign in with")} email`}</span>
        </span>
      </button>

      {/* Email form — animated expand */}
      <div
        className={`auth-expand-grid ${showEmailForm ? "auth-expand-grid--open" : ""}`}
      >
        <div className="auth-expand-inner">
          <div style={{ paddingBottom: "0.5rem" }}>
            <EmailPasswordForm
              email={email}
              password={password}
              setEmail={setEmail}
              setPassword={setPassword}
              onSubmit={signInWithEmail}
              isSubmitting={isSigningIn}
              submitButtonText={
                isSigningIn ? t("login.loggingIn") : t("login.login")
              }
            />
            <button
              type="button"
              onClick={() => navigate("/auth/reset")}
              className="auth-link-black"
              style={{ fontSize: "0.8125rem", marginTop: "0.25rem" }}
            >
              {t("login.forgotPassword", "Forgot your password?")}
            </button>
          </div>
        </div>
      </div>

      {/* Skip */}
      <div style={{ textAlign: "center", margin: "1rem 0" }}>
        <button
          type="button"
          onClick={handleAnonymousSignIn}
          disabled={isSigningIn}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: "1rem",
            fontWeight: 700,
            color: "#000000",
          }}
        >
          {isSigningIn
            ? t("login.signingIn", "Signing in...")
            : `${t("signup.skip", "Skip")} →`}
        </button>
      </div>

      {/* Bottom */}
      <div
        style={{
          textAlign: "center",
          marginTop: "auto",
          paddingTop: "1rem",
        }}
      >
        <button
          type="button"
          onClick={() => navigate("/signup")}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: "0.875rem",
            color: "#9ca3af",
          }}
        >
          {t("login.createAccount", "Create an account")}
        </button>
      </div>
    </AuthLayout>
  );
}
