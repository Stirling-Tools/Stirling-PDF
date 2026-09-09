import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import "@app/auth/ui/auth.css";
import { TextInput, PasswordInput } from "@mantine/core";

// Theme-aware auth input colours (the --auth-* vars flip in dark mode via
// auth-theme.css). Exported so other auth screens (e.g. invite accept) render
// their Mantine inputs identically to login.
export const authInputStyles = {
  input: {
    backgroundColor: "var(--auth-input-bg)",
    color: "var(--auth-input-text)",
    borderColor: "var(--auth-input-border)",
    "&:focus": {
      borderColor: "var(--auth-border-focus)",
    },
  },
  label: {
    color: "var(--auth-label-text)",
  },
};

interface EmailPasswordFormProps {
  email: string;
  password: string;
  setEmail: (email: string) => void;
  setPassword: (password: string) => void;
  mfaCode?: string;
  setMfaCode?: (code: string) => void;
  showMfaField?: boolean;
  requiresMfa?: boolean;
  onSubmit: () => void;
  isSubmitting: boolean;
  submitButtonText: string;
  showPasswordField?: boolean;
  fieldErrors?: {
    email?: string;
    password?: string;
    mfaCode?: string;
  };
}

export default function EmailPasswordForm({
  email,
  password,
  setEmail,
  setPassword,
  mfaCode = "",
  setMfaCode,
  showMfaField = false,
  requiresMfa = false,
  onSubmit,
  isSubmitting,
  submitButtonText,
  showPasswordField = true,
  fieldErrors = {},
}: EmailPasswordFormProps) {
  const { t } = useTranslation();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="auth-fields">
        <div className="auth-field">
          <TextInput
            id="email"
            label={t("login.username", "Username")}
            type="text"
            name="username"
            autoComplete="username"
            placeholder={t("login.enterUsername", "Enter username")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={fieldErrors.email}
            classNames={{ label: "auth-label" }}
            styles={authInputStyles}
            autoFocus
          />
        </div>

        {showPasswordField && (
          <div className="auth-field">
            <PasswordInput
              id="password"
              label={t("login.password", "Password")}
              name="current-password"
              autoComplete="current-password"
              placeholder={t("login.enterPassword", "Enter your password")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={fieldErrors.password}
              classNames={{ label: "auth-label" }}
              styles={authInputStyles}
            />
          </div>
        )}
        {showMfaField && (
          <div className="auth-field">
            <TextInput
              id="mfaCode"
              label={t("login.mfaCode", "Authentication Code")}
              type="text"
              name="mfaCode"
              autoComplete="one-time-code"
              placeholder={t("login.enterMfaCode", "Enter 6-digit code")}
              value={mfaCode}
              inputMode="numeric"
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setMfaCode?.(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              pattern="[0-9]*"
              maxLength={6}
              minLength={6}
              error={fieldErrors.mfaCode}
              classNames={{ label: "auth-label" }}
              styles={authInputStyles}
            />
          </div>
        )}
      </div>

      <Button
        type="submit"
        disabled={
          isSubmitting ||
          !email ||
          (showPasswordField && !password) ||
          (requiresMfa && !mfaCode.trim())
        }
        fullWidth
        size="lg"
        fontSize="sm"
        loading={isSubmitting}
        className="auth-submit"
        // Stirling-red brand CTA; the brand accent sets the colour inline so the
        // host app's Mantine primaryColor can't win (editor vs portal differ).
        accent="brand"
      >
        {submitButtonText}
      </Button>
    </form>
  );
}
