import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import ErrorMessage from "@shared/auth/ui/ErrorMessage";
import EmailPasswordForm from "@shared/auth/ui/EmailPasswordForm";
import OAuthButtons from "@shared/auth/ui/OAuthButtons";
import type { SpringLoginState } from "@shared/auth/ui/useSpringLogin";

interface SpringLoginFormProps {
  /** Login state + handlers, from useSpringLogin. */
  state: SpringLoginState;
  /** Light-mode logo source. */
  logoSrc: string;
  /** Optional dark-mode logo source (the editor swaps logos by colour scheme). */
  logoDarkSrc?: string;
  logoAlt?: string;
  /** OAuth CTA prefix, e.g. "Sign in with" (editor SSO-only mode). */
  oauthCtaPrefix?: string;
  /** Editor SSO-only button styling. */
  oauthUseNewStyle?: boolean;
  /**
   * Whether to render the email/password form. Defaults to
   * state.isUserPassAllowed (the portal always shows it); the editor toggles it
   * when SSO providers are present.
   */
  showEmailForm?: boolean;
  /** Optional override for the submit button label. */
  submitButtonText?: string;
  /** Slot rendered above the error message (editor: success banner). */
  aboveError?: ReactNode;
  /** Slot rendered between the divider and the email form (editor: toggle). */
  beforeEmailForm?: ReactNode;
  /** Slot rendered after the form (editor: first-time-setup credentials hint). */
  footer?: ReactNode;
}

/**
 * The shared Spring login form body: logo, error, OAuth buttons, divider, and
 * the email/password form. Rendered by both the editor and the portal inside
 * their own auth shells; state and handlers come from useSpringLogin.
 */
export default function SpringLoginForm({
  state,
  logoSrc,
  logoDarkSrc,
  logoAlt = "Stirling PDF",
  oauthCtaPrefix,
  oauthUseNewStyle,
  showEmailForm,
  submitButtonText,
  aboveError,
  beforeEmailForm,
  footer,
}: SpringLoginFormProps) {
  const { t } = useTranslation();
  const {
    error,
    providers,
    hasProviders,
    isUserPassAllowed,
    isSubmitting,
    email,
    password,
    setEmail,
    setPassword,
    mfaCode,
    setMfaCode,
    requiresMfa,
    signInWithEmail,
    signInWithProvider,
  } = state;

  const renderEmailForm =
    (showEmailForm ?? isUserPassAllowed) && isUserPassAllowed;
  const submitLabel =
    submitButtonText ??
    (isSubmitting
      ? t("login.loggingIn", "Logging In...")
      : t("login.login", "Login"));

  return (
    <>
      <div className="auth-logo-block">
        <img
          src={logoSrc}
          alt={logoAlt}
          className="auth-logo-header auth-logo-header--light"
        />
        {logoDarkSrc && (
          <img
            src={logoDarkSrc}
            alt={logoAlt}
            className="auth-logo-header auth-logo-header--dark"
          />
        )}
      </div>

      {aboveError}

      <ErrorMessage error={error} />

      {hasProviders && (
        <OAuthButtons
          onProviderClick={signInWithProvider}
          isSubmitting={isSubmitting}
          layout="vertical"
          enabledProviders={providers}
          ctaPrefix={oauthCtaPrefix}
          useNewStyle={oauthUseNewStyle}
          styleVariant="light"
        />
      )}

      {hasProviders && isUserPassAllowed && (
        <div className="auth-or-divider">
          <span className="auth-or-divider__rule" aria-hidden />
          <span className="auth-or-divider__label">{t("signup.or", "or")}</span>
          <span className="auth-or-divider__rule" aria-hidden />
        </div>
      )}

      {beforeEmailForm}

      {renderEmailForm && (
        <div style={{ marginTop: hasProviders ? "1rem" : 0 }}>
          <EmailPasswordForm
            email={email}
            password={password}
            setEmail={setEmail}
            setPassword={setPassword}
            mfaCode={mfaCode}
            setMfaCode={setMfaCode}
            showMfaField={requiresMfa || Boolean(mfaCode)}
            requiresMfa={requiresMfa}
            onSubmit={signInWithEmail}
            isSubmitting={isSubmitting}
            submitButtonText={submitLabel}
          />
        </div>
      )}

      {footer}
    </>
  );
}
