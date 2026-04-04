import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AuthLayout from '@app/routes/authShared/AuthLayout'
import LoginHeader from '@app/routes/login/LoginHeader'
import ErrorMessage from '@app/routes/login/ErrorMessage'
import SuccessMessage from '@app/routes/login/SuccessMessage'
import EmailPasswordForm from '@app/routes/login/EmailPasswordForm'
import NavigationLink from '@app/routes/login/NavigationLink'
import { resetPasswordForEmail, updatePassword, getToken } from '@app/auth/supabase'
import { useTranslation } from '@app/hooks/useTranslation'

export default function ResetPassword() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isRecovery, setIsRecovery] = useState(false)
  const [didUpdate, setDidUpdate] = useState(false)

  useEffect(() => {
    const url = new URL(window.location.href)
    const type = url.searchParams.get('type')
    const token = url.searchParams.get('token')

    if (type === 'recovery' && token) {
      // Store the reset token and show password form
      localStorage.setItem('reset_token', token)
      setIsRecovery(true)
    } else if (type === 'recovery' && getToken()) {
      // Already authenticated, show password form
      setIsRecovery(true)
    }
  }, [])

  const handleSendEmail = async () => {
    if (!email) {
      setError(t('login.pleaseEnterEmail'))
      return
    }
    try {
      setIsSubmitting(true)
      setError(null)
      await resetPasswordForEmail(email.trim())
      setSuccess(t('login.passwordResetSent', { email }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reset email')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleUpdatePassword = async () => {
    if (!password || !confirmPassword) {
      setError(t('signup.pleaseFillAllFields'))
      return
    }
    if (password.length < 6) {
      setError(t('signup.passwordTooShort'))
      return
    }
    if (password !== confirmPassword) {
      setError(t('signup.passwordsDoNotMatch'))
      return
    }
    try {
      setIsSubmitting(true)
      setError(null)
      await updatePassword(password)
      setSuccess(t('login.passwordUpdatedSuccess', 'Your password has been updated successfully.'))
      setPassword('')
      setConfirmPassword('')
      setDidUpdate(true)
      localStorage.removeItem('reset_token')
      setTimeout(() => {
        const query = email ? `?email=${encodeURIComponent(email)}` : ''
        navigate(`/login${query}`)
      }, 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update password')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthLayout>
      <LoginHeader title={isRecovery ? t('login.resetYourPassword', 'Reset your password') : t('login.forgotPassword', 'Forgot your password?')} />
      {!didUpdate && <SuccessMessage success={success} />}
      <ErrorMessage error={error} />

      {didUpdate ? (
        <>
          <SuccessMessage success={success || t('login.passwordUpdatedSuccess', 'Your password has been updated successfully.')} />
          <NavigationLink
            onClick={() => navigate('/login')}
            text={t('login.backToSignIn', 'Back to sign in')}
            isDisabled={isSubmitting}
          />
        </>
      ) : isRecovery ? (
        <>
          <div className="auth-fields">
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
                className="auth-input"
              />
            </div>
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
                className="auth-input"
              />
            </div>
          </div>
          <button
            onClick={handleUpdatePassword}
            disabled={isSubmitting || !password || !confirmPassword}
            className="auth-button"
          >
            {isSubmitting ? t('login.sending', 'Sending…') : t('login.updatePassword', 'Update password')}
          </button>
          <NavigationLink
            onClick={() => navigate('/login')}
            text={t('login.backToSignIn', 'Back to sign in')}
            isDisabled={isSubmitting}
          />
        </>
      ) : (
        <>
          <EmailPasswordForm
            email={email}
            password={''}
            setEmail={setEmail}
            setPassword={() => {}}
            onSubmit={handleSendEmail}
            isSubmitting={isSubmitting}
            submitButtonText={t('login.sendResetLink', 'Send reset link')}
            showPasswordField={false}
          />
          <p className="text-sm text-gray-500 mt-3">
            {t('login.resetHelp', 'Enter your email to receive a secure link to reset your password. If the link has expired, please request a new one.')}
          </p>
          <NavigationLink
            onClick={() => navigate('/login')}
            text={t('login.backToSignIn', 'Back to sign in')}
            isDisabled={isSubmitting}
          />
        </>
      )}
    </AuthLayout>
  )
}
