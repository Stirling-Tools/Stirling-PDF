import { useTranslation } from "react-i18next";
import ErrorMessage from "@shared/auth/ui/ErrorMessage";
import EmailPasswordForm from "@shared/auth/ui/EmailPasswordForm";
import OAuthButtons from "@shared/auth/ui/OAuthButtons";
import type { SupabaseLoginState } from "@shared/auth/ui/useSupabaseLogin";
import "@shared/auth/ui/auth.css";

interface SupabaseLoginFormProps {
  /** Login state + handlers, from useSupabaseLogin. */
  state: SupabaseLoginState;
  /** Optional logo rendered above the form. */
  logoSrc?: string;
  logoAlt?: string;
}

/**
 * Supabase counterpart to {@link SpringLoginForm}: the shared login body (error,
 * SSO buttons, divider, email/password) wired to {@link useSupabaseLogin}. Reuses
 * the same presentational pieces as the Spring form so it matches the SaaS login.
 */
export default function SupabaseLoginForm({
  state,
  logoSrc,
  logoAlt = "Stirling PDF",
}: SupabaseLoginFormProps) {
  const { t } = useTranslation();
  const {
    error,
    providers,
    hasProviders,
    isSubmitting,
    email,
    password,
    setEmail,
    setPassword,
    signInWithEmail,
    signInWithProvider,
  } = state;

  return (
    <>
      {logoSrc && (
        <div className="auth-logo-block">
          <img
            src={logoSrc}
            alt={logoAlt}
            className="auth-logo-header auth-logo-header--light"
          />
        </div>
      )}

      <ErrorMessage error={error} />

      {hasProviders && (
        <OAuthButtons
          onProviderClick={signInWithProvider}
          isSubmitting={isSubmitting}
          layout="fullwidth"
          enabledProviders={providers}
          ctaPrefix={`${t("login.signInWith", "Sign in with")} `}
        />
      )}

      {hasProviders && (
        <div className="auth-or-divider">
          <span className="auth-or-divider__rule" aria-hidden />
          <span className="auth-or-divider__label">{t("signup.or", "or")}</span>
          <span className="auth-or-divider__rule" aria-hidden />
        </div>
      )}

      <div style={{ marginTop: hasProviders ? "1rem" : 0 }}>
        <EmailPasswordForm
          email={email}
          password={password}
          setEmail={setEmail}
          setPassword={setPassword}
          onSubmit={signInWithEmail}
          isSubmitting={isSubmitting}
          submitButtonText={
            isSubmitting
              ? t("login.loggingIn", "Logging In...")
              : t("login.login", "Login")
          }
        />
      </div>
    </>
  );
}
