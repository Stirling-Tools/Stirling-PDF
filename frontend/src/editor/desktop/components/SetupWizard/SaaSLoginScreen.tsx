import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import LoginHeader from "@editor/routes/login/LoginHeader";
import ErrorMessage from "@editor/auth/ui/ErrorMessage";
import EmailPasswordForm from "@editor/auth/ui/EmailPasswordForm";
import DividerWithText from "@editor/components/shared/DividerWithText";
import { DesktopOAuthButtons } from "@editor/components/SetupWizard/DesktopOAuthButtons";
import { SelfHostedLink } from "@editor/components/SetupWizard/SelfHostedLink";
import { UserInfo } from "@editor/services/authService";
import { Button } from "@editor/ui/Button";
import { openExternal } from "@editor/platform/openExternal";
import { webPageUrl } from "@editor/utils/webPageUrl";
import "@editor/auth/ui/auth.css";

interface SaaSLoginScreenProps {
  serverUrl: string;
  onLogin: (username: string, password: string) => Promise<void>;
  onOAuthSuccess: (userInfo: UserInfo) => Promise<void>;
  onSelfHostedClick?: () => void;
  onSwitchToSignup: () => void;
  onSkipSignIn?: () => void;
  onClose?: () => void;
  loading: boolean;
  error: string | null;
}

export const SaaSLoginScreen: React.FC<SaaSLoginScreenProps> = ({
  serverUrl,
  onLogin,
  onOAuthSuccess,
  onSelfHostedClick,
  onSwitchToSignup,
  onSkipSignIn,
  onClose,
  loading,
  error,
}) => {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleEmailPasswordSubmit = async () => {
    // Validation
    if (!email.trim()) {
      setValidationError(
        t("setup.login.error.emptyEmail", "Please enter your email"),
      );
      return;
    }

    if (!password) {
      setValidationError(
        t("setup.login.error.emptyPassword", "Please enter your password"),
      );
      return;
    }

    setValidationError(null);
    await onLogin(email.trim(), password);
  };

  const handleOAuthError = (errorMessage: string) => {
    setValidationError(errorMessage);
  };

  // Reset runs on the web app's reset page, which also receives the emailed
  // link; opening it keeps one copy of the flow instead of a desktop fork.
  const openPasswordReset = async () => {
    setValidationError(null);
    try {
      await openExternal(
        webPageUrl(import.meta.env.VITE_SAAS_FRONTEND_URL, "auth/reset"),
      );
    } catch {
      setValidationError(
        t(
          "setup.login.error.openResetFailed",
          "Could not open your browser to reset your password.",
        ),
      );
    }
  };

  // The local message wins because it is always the newer one: every path that
  // can set `error` (email submit, OAuth success) clears validationError first.
  const displayError = validationError || error;

  return (
    <>
      <LoginHeader
        title={t("setup.saas.title", "Sign in to Stirling Cloud")}
        onClose={onClose}
      />

      <ErrorMessage error={displayError} />

      <DesktopOAuthButtons
        onOAuthSuccess={(userInfo) => {
          setValidationError(null);
          return onOAuthSuccess(userInfo);
        }}
        onError={handleOAuthError}
        isDisabled={loading}
        serverUrl={serverUrl}
        mode="saas"
        providers={[{ id: "google" }, { id: "github" }]}
      />

      <DividerWithText
        text={t("setup.login.orContinueWith", "Or continue with email")}
        respondsToDarkMode={false}
        opacity={0.4}
      />

      <EmailPasswordForm
        email={email}
        password={password}
        setEmail={(value) => {
          setEmail(value);
          setValidationError(null);
        }}
        setPassword={(value) => {
          setPassword(value);
          setValidationError(null);
        }}
        onSubmit={handleEmailPasswordSubmit}
        isSubmitting={loading}
        submitButtonText={t("setup.login.submit", "Login")}
      />

      <div
        className="navigation-link-container"
        style={{
          marginTop: "0.5rem",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <Button
          variant="tertiary"
          onClick={() => void openPasswordReset()}
          className="navigation-link-button"
          disabled={loading}
        >
          {t("login.forgotPassword", "Forgot your password?")}
        </Button>
        <Button
          variant="tertiary"
          onClick={() => {
            setValidationError(null);
            onSwitchToSignup();
          }}
          className="navigation-link-button"
          disabled={loading}
        >
          {t("signup.signUp", "Sign Up")}
        </Button>
      </div>

      {onSelfHostedClick && (
        <SelfHostedLink onClick={onSelfHostedClick} disabled={loading} />
      )}

      {onSkipSignIn && (
        <div
          className="navigation-link-container"
          style={{ marginTop: "0.5rem", textAlign: "center" }}
        >
          <Button
            variant="tertiary"
            onClick={onSkipSignIn}
            className="navigation-link-button"
            disabled={loading}
          >
            {t("setup.login.skipSignIn", "Continue without signing in")}
          </Button>
        </div>
      )}
    </>
  );
};
