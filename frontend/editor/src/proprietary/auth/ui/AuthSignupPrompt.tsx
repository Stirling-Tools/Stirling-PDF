import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import "@app/auth/ui/auth.css";

interface AuthSignupPromptProps {
  /** Navigate to the signup screen. */
  onSignUp: () => void;
}

/**
 * "Don't have an account? Sign up" row shown beneath the login form. The prompt
 * is muted; the action reads as a brand-coloured link.
 */
export default function AuthSignupPrompt({ onSignUp }: AuthSignupPromptProps) {
  const { t } = useTranslation();
  return (
    <div className="auth-signup-prompt">
      <span>{t("login.noAccount", "Don't have an account?")}</span>
      <Button
        type="button"
        variant="quiet"
        accent="brand"
        onClick={onSignUp}
        className="auth-signup-link"
      >
        {t("signup.signUp", "Sign up")}
      </Button>
    </div>
  );
}
