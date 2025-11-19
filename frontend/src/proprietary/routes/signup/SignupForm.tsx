import { useEffect } from 'react';
import '@app/routes/authShared/auth.css';
import { useTranslation } from 'react-i18next';
import { Checkbox } from '@mantine/core';
import { SignupFieldErrors } from '@app/routes/signup/SignupFormValidation';

interface SignupFormProps {
  name?: string
  email: string
  password: string
  confirmPassword: string
  agree?: boolean
  setName?: (name: string) => void
  setEmail: (email: string) => void
  setPassword: (password: string) => void
  setConfirmPassword: (password: string) => void
  setAgree?: (agree: boolean) => void
  onSubmit: () => void
  isSubmitting: boolean
  fieldErrors?: SignupFieldErrors
  showName?: boolean
  showTerms?: boolean
}

export default function SignupForm({
  name = '',
  email,
  password,
  confirmPassword,
  agree = true,
  setName,
  setEmail,
  setPassword,
  setConfirmPassword,
  setAgree,
  onSubmit,
  isSubmitting,
  fieldErrors = {},
  showName = false,
  showTerms = false
}: SignupFormProps) {
  const { t } = useTranslation();
  const showConfirm = password.length >= 4;

  useEffect(() => {
    if (!showConfirm && confirmPassword) {
      setConfirmPassword('');
    }
  }, [showConfirm, confirmPassword, setConfirmPassword]);

  return (
    <>
      <div className="auth-fields">
        {showName && (
          <div className="auth-field">
            <label htmlFor="name" className="auth-label">{t('signup.name')}</label>
            <input
              id="name"
              type="text"
              name="name"
              autoComplete="name"
              placeholder={t('signup.enterName')}
              value={name}
              onChange={(e) => setName?.(e.target.value)}
              className={`auth-input ${fieldErrors.name ? 'auth-input-error' : ''}`}
            />
            {fieldErrors.name && (
              <div className="auth-field-error">{fieldErrors.name}</div>
            )}
          </div>
        )}

        <div className="auth-field">
          <label htmlFor="email" className="auth-label">{t('signup.email')}</label>
          <input
            id="email"
            type="email"
            name="email"
            autoComplete="email"
            placeholder={t('signup.enterEmail')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && !isSubmitting && onSubmit()}
            className={`auth-input ${fieldErrors.email ? 'auth-input-error' : ''}`}
          />
          {fieldErrors.email && (
            <div className="auth-field-error">{fieldErrors.email}</div>
          )}
        </div>

        <div className="auth-field">
          <label htmlFor="password" className="auth-label">{t('signup.password')}</label>
          <input
            id="password"
            type="password"
            name="new-password"
            autoComplete="new-password"
            placeholder={t('signup.enterPassword')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && !isSubmitting && onSubmit()}
            className={`auth-input ${fieldErrors.password ? 'auth-input-error' : ''}`}
          />
          {fieldErrors.password && (
            <div className="auth-field-error">{fieldErrors.password}</div>
          )}
        </div>

        <div
          aria-hidden={!showConfirm}
          className="auth-confirm"
          style={{ maxHeight: showConfirm ? 96 : 0, opacity: showConfirm ? 1 : 0 }}
        >
          <div className="auth-field">
            <label htmlFor="confirmPassword" className="auth-label">{t('signup.confirmPassword')}</label>
            <input
              id="confirmPassword"
              type="password"
              name="new-password"
              autoComplete="new-password"
              placeholder={t('signup.confirmPasswordPlaceholder')}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && !isSubmitting && onSubmit()}
              className={`auth-input ${fieldErrors.confirmPassword ? 'auth-input-error' : ''}`}
            />
            {fieldErrors.confirmPassword && (
              <div className="auth-field-error">{fieldErrors.confirmPassword}</div>
            )}
          </div>
        </div>
      </div>

      {/* Terms - only show if showTerms is true */}
      {showTerms && (
        <div className="auth-terms">
          <Checkbox
            id="agree"
            checked={agree}
            onChange={(e) => setAgree?.(e.currentTarget.checked)}
            className="auth-checkbox"
            label={
              <span className="auth-terms-label">
                {t("legal.iAgreeToThe", 'I agree to all of the')}{' '}
                <a href="https://www.stirlingpdf.com/terms" target="_blank" rel="noopener noreferrer">
                  {t('legal.terms', 'Terms and Conditions')}
                </a>
              </span>
            }
          />
        </div>
      )}

      {/* Sign Up Button */}
      <button
        onClick={onSubmit}
        disabled={isSubmitting || !email || !password || !confirmPassword || (showTerms && !agree)}
        className="auth-button"
      >
        {isSubmitting ? t('signup.creatingAccount') : t('signup.signUp')}
      </button>
    </>
  );
}
