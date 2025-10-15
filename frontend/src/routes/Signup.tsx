import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { springAuth } from '../auth/springAuthClient'
import { useAuth } from '../auth/UseSession'
import { useTranslation } from 'react-i18next'
import { useDocumentMeta } from '../hooks/useDocumentMeta'
import { BASE_PATH } from '../constants/app'
import AuthLayout from './authShared/AuthLayout'

// Import signup components
import LoginHeader from './login/LoginHeader'
import ErrorMessage from './login/ErrorMessage'
import OAuthButtons from './login/OAuthButtons'
import DividerWithText from '../components/shared/DividerWithText'
import NavigationLink from './login/NavigationLink'
import SignupForm from './signup/SignupForm'
import { useSignupFormValidation, SignupFieldErrors } from './signup/SignupFormValidation'

export default function Signup() {
  const navigate = useNavigate()
  const { session, loading } = useAuth()
  const { t } = useTranslation()
  const [isSigningUp, setIsSigningUp] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [agree, setAgree] = useState(true)
  const [fieldErrors, setFieldErrors] = useState<SignupFieldErrors>({})

  const baseUrl = window.location.origin + BASE_PATH;

  // Set document meta
  useDocumentMeta({
    title: `${t('signup.title', 'Create an account')} - Stirling PDF`,
    description: t('app.description', 'The Free Adobe Acrobat alternative (10M+ Downloads)'),
    ogTitle: `${t('signup.title', 'Create an account')} - Stirling PDF`,
    ogDescription: t('app.description', 'The Free Adobe Acrobat alternative (10M+ Downloads)'),
    ogImage: `${baseUrl}/og_images/home.png`,
    ogUrl: `${window.location.origin}${window.location.pathname}`
  })

  const { validateSignupForm } = useSignupFormValidation()

  const handleSignUp = async () => {
    const validation = validateSignupForm(email, password, confirmPassword, name)
    if (!validation.isValid) {
      setError(validation.error)
      setFieldErrors(validation.fieldErrors || {})
      return
    }

    try {
      setIsSigningUp(true)
      setError(null)
      setFieldErrors({})

      console.log('[Signup] Creating account for:', email)

      const { user, error } = await springAuth.signUp({
        email: email.trim(),
        password: password,
        options: {
          data: { full_name: name }
        }
      })

      if (error) {
        console.error('[Signup] Sign up error:', error)
        setError(error.message)
      } else if (user) {
        console.log('[Signup] Account created successfully')
        // Show success message
        alert(t('signup.accountCreatedSuccessfully') || 'Account created successfully! Please log in.')
        // Redirect to login
        setTimeout(() => navigate('/login'), 1000)
      }
    } catch (err) {
      console.error('[Signup] Unexpected error:', err)
      setError(err instanceof Error ? err.message : (t('signup.unexpectedError', { message: 'Unknown error' }) || 'An unexpected error occurred'))
    } finally {
      setIsSigningUp(false)
    }
  }

  const handleProviderSignIn = async (provider: 'github' | 'google' | 'apple' | 'azure') => {
    try {
      setIsSigningUp(true)
      setError(null)

      console.log(`[Signup] Signing up with ${provider}`)

      const { error } = await springAuth.signInWithOAuth({
        provider,
        options: { redirectTo: `${BASE_PATH}/auth/callback` }
      })

      if (error) {
        setError(error.message)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : (t('signup.unexpectedError', { message: 'Unknown error' }) || 'An unexpected error occurred'))
    } finally {
      setIsSigningUp(false)
    }
  }

  return (
    <AuthLayout>
      <LoginHeader title={t('signup.title') || 'Create an account'} subtitle={t('signup.subtitle')} />

      <ErrorMessage error={error} />

      <SignupForm
        name={name}
        email={email}
        password={password}
        confirmPassword={confirmPassword}
        agree={agree}
        setName={setName}
        setEmail={setEmail}
        setPassword={setPassword}
        setConfirmPassword={setConfirmPassword}
        setAgree={setAgree}
        onSubmit={handleSignUp}
        isSubmitting={isSigningUp}
        fieldErrors={fieldErrors}
      />

      <div style={{ margin: '0.5rem 0' }}>
        <DividerWithText text={t('signup.or', "or")} respondsToDarkMode={false} opacity={0.4} />
      </div>

      <div style={{ marginBottom: '0.5rem' }}>
        <OAuthButtons
          onProviderClick={handleProviderSignIn}
          isSubmitting={isSigningUp}
          layout="icons"
        />
      </div>

      <div style={{ marginBottom: '0.5rem', textAlign: 'center' }}>
        <NavigationLink
          onClick={() => navigate('/login')}
          text={t('signup.alreadyHaveAccount') || 'Already have an account? Sign in'}
          isDisabled={isSigningUp}
        />
      </div>
    </AuthLayout>
  )
}
