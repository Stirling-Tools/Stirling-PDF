import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { signInAnonymously } from "@app/auth/supabase";
import { useAuth } from "@app/auth/UseSession";
import { useTranslation } from "@app/hooks/useTranslation";
import { useDocumentMeta } from "@app/hooks/useDocumentMeta";
import { getBaseUrl } from "@app/constants/app";
import AuthLayout from "@app/routes/authShared/AuthLayout";
import "@app/routes/authShared/auth.css";
import "@app/routes/authShared/saas-auth.css";
import GuestSignInButton from "@app/routes/authShared/GuestSignInButton";
import { alert } from "@app/components/toast";

// Import signup components
import LoginHeader from "@app/routes/login/LoginHeader";
import ErrorMessage from "@app/routes/login/ErrorMessage";
import OAuthButtons from "@app/routes/login/OAuthButtons";
import DividerWithText from "@app/components/shared/DividerWithText";
import SignupForm from "@app/routes/signup/SignupForm";
import {
  useSignupFormValidation,
  SignupFieldErrors,
} from "@app/routes/signup/SignupFormValidation";
import { useAuthService } from "@app/routes/signup/AuthService";

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
      <LoginHeader title={t("signup.title")} subtitle={t("signup.subtitle")} />

      <ErrorMessage error={error} />

      {/* OAuth first */}
      <div style={{ marginBottom: "0.5rem" }}>
        <OAuthButtons
          onProviderClick={handleProviderSignIn}
          isSubmitting={isSigningUp}
          layout="fullwidth"
        />
      </div>

      {/* Divider between OAuth and Email */}
      <div style={{ margin: "0.5rem 0" }}>
        <DividerWithText
          text={t("signup.or", "or")}
          respondsToDarkMode={false}
          opacity={0.4}
        />
      </div>

      {/* Use Email Instead button (toggles email form) */}
      <div className="auth-section">
        <button
          type="button"
          disabled={isSigningUp}
          onClick={() => setShowEmailForm((v) => !v)}
          className="w-full px-4 py-[0.75rem] rounded-[0.625rem] text-base font-semibold mb-2 cursor-pointer border-0 disabled:opacity-50 disabled:cursor-not-allowed auth-cta-button"
        >
          {t("signup.useEmailInstead", "Use Email Instead")}
        </button>
      </div>

      {showEmailForm && (
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
      )}

      <div className="auth-section-sm">
        <DividerWithText
          text={t("signup.or", "or")}
          respondsToDarkMode={false}
          opacity={0.4}
        />
      </div>

      <GuestSignInButton
        onClick={handleAnonymousSignIn}
        disabled={isSigningUp}
        label={
          isSigningUp
            ? t("login.signingIn", "Signing in...")
            : t("login.signInAnonymously", "Sign in as a Guest")
        }
      />

      {/* Bottom row */}
      <div className="auth-bottom-right">
        <button
          type="button"
          onClick={() => navigate("/login")}
          className="auth-link-black"
        >
          {t("login.logIn", "Log In")}
        </button>
      </div>
    </AuthLayout>
  );
}
