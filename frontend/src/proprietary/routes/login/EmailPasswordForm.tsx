import { useTranslation } from 'react-i18next';
import '@app/routes/authShared/auth.css';
import { TextInput, PasswordInput, Button } from '@mantine/core';

interface EmailPasswordFormProps {
  email: string
  password: string
  setEmail: (email: string) => void
  setPassword: (password: string) => void
  onSubmit: () => void
  isSubmitting: boolean
  submitButtonText: string
  showPasswordField?: boolean
  fieldErrors?: {
    email?: string
    password?: string
  }
}

export default function EmailPasswordForm({
  email,
  password,
  setEmail,
  setPassword,
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
            />
          </div>
        )}
      </div>

      <Button
        type="submit"
        disabled={isSubmitting || !email || (showPasswordField && !password)}
        className="auth-button"
        fullWidth
        loading={isSubmitting}
      >
        {submitButtonText}
      </Button>
    </form>
  );
}
