import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AuthLayout from "@app/routes/authShared/AuthLayout";
import LoginHeader from "@app/routes/login/LoginHeader";
import ErrorMessage from "@app/routes/login/ErrorMessage";
import SuccessMessage from "@app/routes/login/SuccessMessage";
import EmailPasswordForm from "@app/routes/login/EmailPasswordForm";
import NavigationLink from "@app/routes/login/NavigationLink";
import { supabase } from "@app/auth/supabase";
import { absoluteWithBasePath } from "@app/constants/app";
import { useTranslation } from "@app/hooks/useTranslation";

export default function ResetPassword() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isRecovery, setIsRecovery] = useState(false);
  const [didUpdate, setDidUpdate] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    const type = url.searchParams.get("type");
    const code = url.searchParams.get("code");

    // Also parse hash params (Supabase puts tokens & type in the hash)
    const hash = url.hash || "";
    const hashParams = new URLSearchParams(
      hash.startsWith("#") ? hash.substring(1) : hash,
    );
    const hashType = hashParams.get("type");
    const hashError = hashParams.get("error");
    const hashErrorDescription = hashParams.get("error_description");

    if (hashError) {
      // Show a human-readable error and fall back to email-entry form
      setError(hashErrorDescription || hashError);
      setIsRecovery(false);
    }

    // Consider either source (query or hash) to decide if we're in recovery mode
    const inRecovery = type === "recovery" || hashType === "recovery";
    setIsRecovery(inRecovery);

    // If a PKCE-style code is present, exchange it for a session immediately
    const tryExchange = async () => {
      if (code) {
        try {
          const { data, error } =
            await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            setError(error.message);
            setIsRecovery(false);
          } else if (data.session) {
            setIsRecovery(true);
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
          setIsRecovery(false);
        }
      } else {
        // If no code, see if Supabase already set the session from hash
        const { data } = await supabase.auth.getSession();
        if (data.session && inRecovery) {
          setIsRecovery(true);
        }
      }
    };
    void tryExchange();

    // Clear sensitive tokens from the URL hash
    if (hash.includes("access_token") || hashError) {
      window.history.replaceState(
        {},
        document.title,
        window.location.pathname + (inRecovery ? "?type=recovery" : ""),
      );
    }

    // Listen for Supabase auth state changes to confirm recovery state
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsRecovery(true);
      }
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  const handleSendEmail = async () => {
    if (!email) {
      setError(t("login.pleaseEnterEmail"));
      return;
    }
    try {
      setIsSubmitting(true);
      setError(null);
      const redirectTo = absoluteWithBasePath("/auth/reset?type=recovery");
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        {
          redirectTo,
        },
      );
      if (error) {
        setError(error.message);
      } else {
        setSuccess(t("login.passwordResetSent", { email }));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!password || !confirmPassword) {
      setError(t("signup.pleaseFillAllFields"));
      return;
    }
    if (password.length < 6) {
      setError(t("signup.passwordTooShort"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("signup.passwordsDoNotMatch"));
      return;
    }
    try {
      setIsSubmitting(true);
      setError(null);
      const { data, error } = await supabase.auth.updateUser({ password });
      if (error) {
        setError(error.message);
        return;
      }
      if (data.user) {
        setSuccess(
          t(
            "login.passwordUpdatedSuccess",
            "Your password has been updated successfully.",
          ),
        );
        // Clear the form fields
        setPassword("");
        setConfirmPassword("");
        // Show success-only state and then redirect after a short delay
        setDidUpdate(true);
        setTimeout(async () => {
          const { data: sessionData } = await supabase.auth.getSession();
          const { data: userData } = await supabase.auth.getUser();
          const derivedEmail = userData.user?.email || email;
          if (sessionData.session) {
            navigate("/");
          } else {
            const query = derivedEmail
              ? `?email=${encodeURIComponent(derivedEmail)}`
              : "";
            navigate(`/login${query}`);
          }
        }, 2000);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout>
      <LoginHeader
        title={
          isRecovery
            ? t("login.resetYourPassword", "Reset your password")
            : t("login.forgotPassword", "Forgot your password?")
        }
      />
      {!didUpdate && <SuccessMessage success={success} />}
      <ErrorMessage error={error} />

      {didUpdate ? (
        <>
          <SuccessMessage
            success={
              success ||
              t(
                "login.passwordUpdatedSuccess",
                "Your password has been updated successfully.",
              )
            }
          />
          <NavigationLink
            onClick={() => navigate("/login")}
            text={t("login.backToSignIn", "Back to sign in")}
            isDisabled={isSubmitting}
          />
        </>
      ) : isRecovery ? (
        <>
          <div className="auth-fields">
            <div className="auth-field">
              <label htmlFor="password" className="auth-label">
                {t("signup.password")}
              </label>
              <input
                id="password"
                type="password"
                name="new-password"
                autoComplete="new-password"
                placeholder={t("signup.enterPassword")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="auth-input"
              />
            </div>
            <div className="auth-field">
              <label htmlFor="confirmPassword" className="auth-label">
                {t("signup.confirmPassword")}
              </label>
              <input
                id="confirmPassword"
                type="password"
                name="new-password"
                autoComplete="new-password"
                placeholder={t("signup.confirmPasswordPlaceholder")}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="auth-input"
              />
            </div>
          </div>
          <button
            onClick={handleUpdatePassword}
            disabled={isSubmitting || !password || !confirmPassword}
            className="auth-button"
          >
            {isSubmitting
              ? t("login.sending", "Sending…")
              : t("login.updatePassword", "Update password")}
          </button>
          <NavigationLink
            onClick={() => navigate("/login")}
            text={t("login.backToSignIn", "Back to sign in")}
            isDisabled={isSubmitting}
          />
        </>
      ) : (
        <>
          <EmailPasswordForm
            email={email}
            password={""}
            setEmail={setEmail}
            setPassword={() => {}}
            onSubmit={handleSendEmail}
            isSubmitting={isSubmitting}
            submitButtonText={t("login.sendResetLink", "Send reset link")}
            showPasswordField={false}
          />
          <p className="text-sm text-gray-500 mt-3">
            {t(
              "login.resetHelp",
              "Enter your email to receive a secure link to reset your password. If the link has expired, please request a new one.",
            )}
          </p>
          <NavigationLink
            onClick={() => navigate("/login")}
            text={t("login.backToSignIn", "Back to sign in")}
            isDisabled={isSubmitting}
          />
        </>
      )}
    </AuthLayout>
  );
}
