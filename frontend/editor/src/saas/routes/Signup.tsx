import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { signInAnonymously } from "@app/auth/supabase";
import { useAuth } from "@app/auth/UseSession";
import { useTranslation } from "@app/hooks/useTranslation";
import { useDocumentMeta } from "@app/hooks/useDocumentMeta";
import { getBaseUrl, withBasePath } from "@app/constants/app";
import AuthLayout from "@app/routes/authShared/AuthLayout";
import "@shared/auth/ui/auth.css";
import "@app/routes/authShared/saas-auth.css";
import { alert } from "@app/components/toast";

// Import signup components
import ErrorMessage from "@shared/auth/ui/ErrorMessage";
import OAuthButtons from "@app/routes/login/OAuthButtons";
import SignupForm from "@app/routes/signup/SignupForm";
import {
  useSignupFormValidation,
  SignupFieldErrors,
} from "@app/routes/signup/SignupFormValidation";
import { useAuthService } from "@app/routes/signup/AuthService";
import loginHeader from "@shared/assets/brand/modern-logo/LoginLightModeHeader.svg";

export default function Signup() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, loading, refreshSession } = useAuth();
  const { t } = useTranslation();
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [name, setName] = useState(undefined as string | undefined);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agree, setAgree] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<SignupFieldErrors>({});

  // Check if we were redirected here with an auto-auth error
  useEffect(() => {
    const state = location.state as { autoAuthError?: string } | null;
    if (state?.autoAuthError) {
      setError(`Unable to access tool: ${state.autoAuthError}`);
    }
  }, [location.state]);

  // Redirect back to original tool URL once session appears (after auto-anon completes)
  useEffect(() => {
    if (!loading && session) {
      const state = location.state as {
        from?: { pathname?: string; search?: string; hash?: string };
      } | null;
      const from = state?.from;
      if (
        from?.pathname &&
        from.pathname !== "/signup" &&
        from.pathname !== "/login"
      ) {
        const target = `${from.pathname}${from.search ?? ""}${from.hash ?? ""}`;
        console.log("[Signup] Session detected, redirecting back to:", target);
        navigate(target, { replace: true });
      }
    }
  }, [loading, session, location.state, navigate]);

  const handleAnonymousSignIn = async () => {
    try {
      setIsSigningUp(true);
      setError(null);

      console.log("[Signup] Initiating anonymous sign-in...");
      const { data } = await signInAnonymously();

      if (data.user) {
        console.log(
          "[Signup] Anonymous sign-in successful, refreshing session...",
        );

        // Refresh session to ensure backend endpoints are properly synchronized
        await refreshSession();

        console.log("[Signup] Session refreshed, redirecting to home page");
        // Redirect to home page after successful anonymous login and session refresh
        navigate("/");
      }
    } catch (err) {
      console.error("[Signup] Anonymous sign-in unexpected error:", err);
      setError(
        `Unexpected error: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    } finally {
      setIsSigningUp(false);
    }
  };

  const baseUrl = getBaseUrl();

  // Set document meta
  useDocumentMeta({
    title: `${t("signup.title", "Create an account")} - Stirling PDF`,
    description: t(
      "app.description",
      "The Free Adobe Acrobat alternative (10M+ Downloads)",
    ),
    ogTitle: `${t("signup.title", "Create an account")} - Stirling PDF`,
    ogDescription: t(
      "app.description",
      "The Free Adobe Acrobat alternative (10M+ Downloads)",
    ),
    ogImage: `${baseUrl}/og_images/home.png`,
    ogUrl: `${window.location.origin}${window.location.pathname}`,
  });

  const { validateSignupForm } = useSignupFormValidation();
  const { signUp, signInWithProvider } = useAuthService();

  const handleSignUp = async () => {
    const validation = validateSignupForm(
      email,
      password,
      confirmPassword,
      name,
    );
    if (!validation.isValid) {
      setError(validation.error);
      setFieldErrors(validation.fieldErrors || {});
      return;
    }

    try {
      setIsSigningUp(true);
      setError(null);
      setFieldErrors({});

      const result = await signUp(email, password, name);

      if (result.requiresEmailConfirmation) {
        alert({
          alertType: "success",
          title: t("signup.checkEmailConfirmation"),
          location: "top-right",
          isPersistentPopup: true,
        });
      } else {
        alert({
          alertType: "success",
          title: t("signup.accountCreatedSuccessfully"),
          location: "top-right",
          durationMs: 3000,
        });
        setTimeout(() => navigate("/login"), 2000);
      }
    } catch (err) {
      console.error("[Signup] Unexpected error:", err);
      setError(
        err instanceof Error
          ? err.message
          : t("signup.unexpectedError", { message: "Unknown error" }),
      );
    } finally {
      setIsSigningUp(false);
    }
  };

  const handleProviderSignIn = async (
    provider: "github" | "google" | "apple" | "azure",
  ) => {
    try {
      setIsSigningUp(true);
      setError(null);
      await signInWithProvider(provider);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t("signup.unexpectedError", { message: "Unknown error" }),
      );
    } finally {
      setIsSigningUp(false);
    }
  };

  return (
    <AuthLayout isEmailFormExpanded={showEmailForm}>
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

      {/* OAuth providers */}
      <div>
        <OAuthButtons
          onProviderClick={handleProviderSignIn}
          isSubmitting={isSigningUp}
          layout="fullwidth"
          labelPrefix={`${t("signup.signUpWith", "Sign up with")} `}
        />
      </div>

      {/* Email & Password button */}
      <button
        type="button"
        disabled={isSigningUp}
        onClick={() => setShowEmailForm((v) => !v)}
        className={`oauth-button-fullwidth auth-expandable-trigger ${showEmailForm ? "auth-expandable-trigger--active" : ""}`}
        style={{ marginTop: "2.5rem", marginBottom: "0.75rem" }}
      >
        <span className="oauth-btn-group">
          <span className="auth-at-icon">@</span>
          <span className="oauth-btn-label">{`${t("signup.signUpWith", "Sign up with")} email`}</span>
        </span>
      </button>

      {/* Email form — animated expand */}
      <div
        className={`auth-expand-grid ${showEmailForm ? "auth-expand-grid--open" : ""}`}
      >
        <div className="auth-expand-inner">
          <div style={{ paddingBottom: "0.5rem" }}>
            <SignupForm
              name={name}
              email={email}
              password={password}
              confirmPassword={confirmPassword}
              agree={agree}
              setName={setName}
              setEmail={setEmail}
              setPassword={setPassword}
              setConfirmPassword={setConfirmPassword}
              setAgree={setAgree}
              onSubmit={handleSignUp}
              isSubmitting={isSigningUp}
              fieldErrors={fieldErrors}
            />
          </div>
        </div>
      </div>

      {/* Skip */}
      <div style={{ textAlign: "center", margin: "1rem 0" }}>
        <button
          type="button"
          onClick={handleAnonymousSignIn}
          disabled={isSigningUp}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: "1rem",
            fontWeight: 700,
            color: "#000000",
          }}
        >
          {isSigningUp
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
          onClick={() => navigate("/login")}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: "0.875rem",
            color: "#9ca3af",
          }}
        >
          {t("signup.alreadyHaveAccount", "I already have an account")}
        </button>
      </div>
    </AuthLayout>
  );
}
