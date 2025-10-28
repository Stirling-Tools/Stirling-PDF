import { useTranslation } from 'react-i18next';
import '@app/routes/authShared/auth.css';

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
          <label htmlFor="email" className="auth-label">{t('login.username', 'Username')}</label>
          <input
            id="email"
            type="text"
            name="username"
            autoComplete="username"
            placeholder={t('login.enterUsername', 'Enter username')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`auth-input ${fieldErrors.email ? 'auth-input-error' : ''}`}
          />
          {fieldErrors.email && (
            <div className="auth-field-error">{fieldErrors.email}</div>
          )}
        </div>

        {showPasswordField && (
          <div className="auth-field">
            <label htmlFor="password" className="auth-label">{t('login.password')}</label>
            <input
              id="password"
              type="password"
              name="current-password"
              autoComplete="current-password"
              placeholder={t('login.enterPassword')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`auth-input ${fieldErrors.password ? 'auth-input-error' : ''}`}
            />
            {fieldErrors.password && (
              <div className="auth-field-error">{fieldErrors.password}</div>
            )}
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={isSubmitting || !email || (showPasswordField && !password)}
        className="auth-button"
      >
        {submitButtonText}
      </button>
    </form>
  );
}
