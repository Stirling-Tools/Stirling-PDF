import { useEffect } from 'react';
import '@app/routes/authShared/auth.css';
import { useTranslation } from 'react-i18next';
import { Checkbox, TextInput, PasswordInput, Button } from '@mantine/core';
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
            <TextInput
              id="name"
              label={t('signup.name')}
              name="name"
              autoComplete="name"
              placeholder={t('signup.enterName')}
              value={name}
              onChange={(e) => setName?.(e.target.value)}
              error={fieldErrors.name}
              classNames={{ label: 'auth-label' }}
            />
          </div>
        )}

        <div className="auth-field">
          <TextInput
            id="email"
            label={t('signup.email')}
            type="email"
            name="email"
            autoComplete="email"
            placeholder={t('signup.enterEmail')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !isSubmitting && onSubmit()}
            error={fieldErrors.email}
            classNames={{ label: 'auth-label' }}
          />
        </div>

        <div className="auth-field">
          <PasswordInput
            id="password"
            label={t('signup.password')}
            name="new-password"
            autoComplete="new-password"
            placeholder={t('signup.enterPassword')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !isSubmitting && onSubmit()}
            error={fieldErrors.password}
            classNames={{ label: 'auth-label' }}
          />
        </div>

        <div
          aria-hidden={!showConfirm}
          className="auth-confirm"
          style={{ maxHeight: showConfirm ? 96 : 0, opacity: showConfirm ? 1 : 0 }}
        >
          <div className="auth-field">
            <PasswordInput
              id="confirmPassword"
              label={t('signup.confirmPassword')}
              name="new-password"
              autoComplete="new-password"
              placeholder={t('signup.confirmPasswordPlaceholder')}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !isSubmitting && onSubmit()}
              error={fieldErrors.confirmPassword}
              classNames={{ label: 'auth-label' }}
            />
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
      <Button
        onClick={onSubmit}
        disabled={isSubmitting || !email || !password || !confirmPassword || (showTerms && !agree)}
        className="auth-button"
        fullWidth
        loading={isSubmitting}
      >
        {isSubmitting ? t('signup.creatingAccount') : t('signup.signUp')}
      </Button>
    </>
  );
}
