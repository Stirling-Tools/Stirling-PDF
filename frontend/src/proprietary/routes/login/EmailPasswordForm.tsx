import { useTranslation } from 'react-i18next';
import '@app/routes/authShared/auth.css';
import { TextInput, PasswordInput, Button } from '@mantine/core';

// Force light mode styles for auth inputs
const authInputStyles = {
  input: {
    backgroundColor: 'var(--auth-input-bg-light-only)',
    color: 'var(--auth-input-text-light-only)',
    borderColor: 'var(--auth-input-border-light-only)',
    '&:focus': {
      borderColor: 'var(--auth-border-focus-light-only)',
    },
  },
  label: {
    color: 'var(--auth-label-text-light-only)',
  },
};

interface EmailPasswordFormProps {
  email: string
  password: string
  setEmail: (email: string) => void
  setPassword: (password: string) => void
  mfaCode?: string
  setMfaCode?: (code: string) => void
  showMfaField?: boolean
  requiresMfa?: boolean
  onSubmit: () => void
  isSubmitting: boolean
  submitButtonText: string
  showPasswordField?: boolean
  fieldErrors?: {
    email?: string
    password?: string
    mfaCode?: string
  }
}

export default function EmailPasswordForm({
  email,
  password,
  setEmail,
  setPassword,
  mfaCode = '',
  setMfaCode,
  showMfaField = false,
  requiresMfa = false,
  onSubmit,
  isSubmitting,
  submitButtonText,
  showPasswordField = true,
  fieldErrors = {}
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
            label={t('login.username', 'Username')}
            type="text"
            name="username"
            autoComplete="username"
            placeholder={t('login.enterUsername', 'Enter username')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={fieldErrors.email}
            classNames={{ label: 'auth-label' }}
            styles={authInputStyles}
            autoFocus
          />
        </div>

        {showPasswordField && (
          <div className="auth-field">
            <PasswordInput
              id="password"
              label={t('login.password')}
              name="current-password"
              autoComplete="current-password"
              placeholder={t('login.enterPassword')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={fieldErrors.password}
              classNames={{ label: 'auth-label' }}
              styles={authInputStyles}
            />
          </div>
        )}
        {showMfaField && (
          <div className="auth-field">
            <TextInput
              id="mfaCode"
              label={t('login.mfaCode', 'Authentication code')}
              type="text"
              name="mfaCode"
              autoComplete="one-time-code"
              placeholder={t('login.enterMfaCode', 'Enter 6-digit code')}
              value={mfaCode}
              inputMode="numeric"
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMfaCode?.(e.target.value.replace(/\D/g, '').slice(0, 6))}
              pattern="[0-9]*"
              maxLength={6}
              minLength={6}
              error={fieldErrors.mfaCode}
              classNames={{ label: 'auth-label' }}
              styles={authInputStyles}
            />
          </div>
        )}
      </div>

      <Button
        type="submit"
        disabled={isSubmitting || !email || (showPasswordField && !password) || (requiresMfa && !mfaCode.trim())}
        className="auth-button"
        fullWidth
        loading={isSubmitting}
      >
        {submitButtonText}
      </Button>
    </form>
  );
}
