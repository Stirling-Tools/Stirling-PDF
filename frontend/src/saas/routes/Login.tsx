import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, signInAnonymously } from "@app/auth/supabase";
import { useAuth } from "@app/auth/UseSession";
import { useTranslation } from "@app/hooks/useTranslation";
import { useDocumentMeta } from "@app/hooks/useDocumentMeta";
import AuthLayout from "@app/routes/authShared/AuthLayout";
import "@app/routes/authShared/auth.css";
import "@app/routes/authShared/saas-auth.css";
import GuestSignInButton from "@app/routes/authShared/GuestSignInButton";

// Import login components
import LoginHeader from "@app/routes/login/LoginHeader";
import ErrorMessage from "@app/routes/login/ErrorMessage";
import EmailPasswordForm from "@app/routes/login/EmailPasswordForm";
import MagicLinkForm from "@app/routes/login/MagicLinkForm";
import OAuthButtons from "@app/routes/login/OAuthButtons";
import DividerWithText from "@app/components/shared/DividerWithText";
import LoggedInState from "@app/routes/login/LoggedInState";
import { absoluteWithBasePath, getBaseUrl } from "@app/constants/app";

export default function Login() {
  const navigate = useNavigate();
  const { session, loading, refreshSession } = useAuth();
  const { t } = useTranslation();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMagicLink, setShowMagicLink] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [magicLinkEmail, setMagicLinkEmail] = useState("");
  // Prefill email from query param (e.g. after password reset)
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const emailFromQuery = url.searchParams.get("email");
      if (emailFromQuery) {
        setEmail(emailFromQuery);
      }
    } catch (_) {
      // ignore
    }
  }, []);

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

  // Show logged in state if authenticated
  if (session && !loading) {
    return <LoggedInState />;
  }

  const signInWithProvider = async (
    provider: "github" | "google" | "apple" | "azure",
  ) => {
    try {
      setIsSigningIn(true);
      setError(null);

      const redirectTo = absoluteWithBasePath("/auth/callback");
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
          emailRedirectTo: absoluteWithBasePath("/auth/callback"),
        },
      });

      if (error) {
        console.error("[Login] Magic link error:", error);
        setError(error.message);
      } else {
        setError(null);
        alert(t("login.magicLinkSent", { email: magicLinkEmail }));
        setMagicLinkEmail("");
        setShowMagicLink(false);
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

  const handleForgotPassword = () => {
    navigate("/auth/reset");
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

  return (
    <AuthLayout isEmailFormExpanded={showEmailForm}>
      <LoginHeader
        title={t("login.login")}
        subtitle={t("login.subtitle", "Sign back in to Stirling PDF")}
      />

      <ErrorMessage error={error} />

      {/* OAuth first */}
      <OAuthButtons
        onProviderClick={signInWithProvider}
        isSubmitting={isSigningIn}
        layout="fullwidth"
      />

      {/* Divider between OAuth and Email */}
      <DividerWithText
        text={t("signup.or", "or")}
        respondsToDarkMode={false}
        opacity={0.4}
      />

      {/* Sign in with email button (primary color to match signup CTA) */}
      <div className="auth-section">
        <button
          type="button"
          onClick={() => setShowEmailForm((v) => !v)}
          disabled={isSigningIn}
          className="w-full px-4 py-[0.75rem] rounded-[0.625rem] text-base font-semibold mb-2 cursor-pointer border-0 disabled:opacity-50 disabled:cursor-not-allowed auth-cta-button"
        >
          {t("login.useEmailInstead", "Sign in with email")}
        </button>
      </div>

      {showEmailForm && (
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
      )}

      {showEmailForm && (
        <div className="auth-section-sm">
          <button
            type="button"
            onClick={handleForgotPassword}
            className="auth-link-black"
          >
            {t("login.forgotPassword", "Forgot your password?")}
          </button>
        </div>
      )}

      {/* Divider then Guest */}
      <DividerWithText
        text={t("signup.or", "or")}
        respondsToDarkMode={false}
        opacity={0.4}
      />

      <GuestSignInButton
        onClick={handleAnonymousSignIn}
        disabled={isSigningIn}
        label={
          isSigningIn
            ? t("login.signingIn", "Signing in...")
            : t("login.signInAnonymously", "Sign in as a Guest")
        }
      />

      <div className="auth-bottom-row">
        <button
          type="button"
          onClick={() => setShowMagicLink(true)}
          className="auth-link-black"
        >
          {t("login.useMagicLink", "Sign in with magic link")}
        </button>

        <button
          type="button"
          onClick={() => navigate("/signup")}
          className="auth-link-black"
        >
          {t("signup.signUp", "Sign up")}
        </button>
      </div>

      {/* Magic link form renders on demand */}
      {showMagicLink && (
        <div style={{ marginTop: "0.5rem" }}>
          <MagicLinkForm
            showMagicLink={showMagicLink}
            magicLinkEmail={magicLinkEmail}
            setMagicLinkEmail={setMagicLinkEmail}
            setShowMagicLink={setShowMagicLink}
            onSubmit={signInWithMagicLink}
            isSubmitting={isSigningIn}
          />
        </div>
      )}
    </AuthLayout>
  );
}
