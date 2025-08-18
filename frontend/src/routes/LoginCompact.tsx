import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/useSession'

export default function LoginCompact() {
  const navigate = useNavigate()
  const { session, user, loading, signOut } = useAuth()
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showEmailForm, setShowEmailForm] = useState(false)
  const [showMagicLink, setShowMagicLink] = useState(false)
  const [showPasswordReset, setShowPasswordReset] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [magicLinkEmail, setMagicLinkEmail] = useState('')
  const [resetEmail, setResetEmail] = useState('')

  // Show logged in state if authenticated
  if (session && !loading) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        backgroundColor: '#f3f4f6',
        padding: '16px'
      }}>
        <div style={{
          maxWidth: '400px',
          width: '100%',
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
          padding: '32px'
        }}>
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
            <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#059669', marginBottom: '8px' }}>
              YOU ARE LOGGED IN
            </h1>
            <p style={{ color: '#6b7280', fontSize: '14px' }}>
              Email: {user?.email}
            </p>
          </div>
          
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button
              onClick={() => navigate('/')}
              style={{
                flex: '1',
                padding: '8px 16px',
                backgroundColor: '#3b82f6',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                cursor: 'pointer'
              }}
            >
              Home
            </button>
            <button
              onClick={() => navigate('/debug')}
              style={{
                flex: '1',
                padding: '8px 16px',
                backgroundColor: '#8b5cf6',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                cursor: 'pointer'
              }}
            >
              Debug
            </button>
            <button
              onClick={async () => {
                await signOut()
                window.location.reload()
              }}
              style={{
                flex: '1',
                padding: '8px 16px',
                backgroundColor: '#ef4444',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                cursor: 'pointer'
              }}
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    )
  }

  const signInWithProvider = async (provider: 'github' | 'google' | 'facebook' | 'linkedin_oidc') => {
    try {
      setIsSigningIn(true)
      setError(null)

      const redirectTo = `${window.location.origin}/auth/callback`
      console.log(`[LoginCompact] Signing in with ${provider}`)

      const oauthOptions: any = { redirectTo }
      if (provider === 'facebook') {
        oauthOptions.queryParams = { scope: 'email' }
      } else if (provider === 'linkedin_oidc') {
        oauthOptions.queryParams = { scope: 'openid profile email' }
      } else {
        oauthOptions.queryParams = {
          access_type: 'offline',
          prompt: 'consent',
        }
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: oauthOptions
      })

      if (error) {
        console.error(`[LoginCompact] ${provider} error:`, error)
        setError(`Failed to sign in with ${provider}: ${error.message}`)
      }
    } catch (err) {
      console.error(`[LoginCompact] Unexpected error:`, err)
      setError(`Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setIsSigningIn(false)
    }
  }

  const signInWithEmail = async () => {
    if (!email || !password) {
      setError('Please enter both email and password')
      return
    }

    try {
      setIsSigningIn(true)
      setError(null)
      
      console.log('[LoginCompact] Signing in with email:', email)

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password
      })

      if (error) {
        console.error('[LoginCompact] Email sign in error:', error)
        setError(error.message)
      } else if (data.user) {
        console.log('[LoginCompact] Email sign in successful')
        // User will be redirected by the auth state change
      }
    } catch (err) {
      console.error('[LoginCompact] Unexpected error:', err)
      setError(`Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setIsSigningIn(false)
    }
  }

  const signInWithMagicLink = async () => {
    if (!magicLinkEmail) {
      setError('Please enter your email address')
      return
    }

    try {
      setIsSigningIn(true)
      setError(null)
      
      console.log('[LoginCompact] Sending magic link to:', magicLinkEmail)

      const { error } = await supabase.auth.signInWithOtp({
        email: magicLinkEmail.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`
        }
      })

      if (error) {
        console.error('[LoginCompact] Magic link error:', error)
        setError(error.message)
      } else {
        setError(null)
        alert(`Magic link sent to ${magicLinkEmail}! Check your email and click the link to sign in.`)
        setMagicLinkEmail('')
        setShowMagicLink(false)
      }
    } catch (err) {
      console.error('[LoginCompact] Unexpected error:', err)
      setError(`Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setIsSigningIn(false)
    }
  }

  const resetPassword = async () => {
    if (!resetEmail) {
      setError('Please enter your email address')
      return
    }

    try {
      setIsSigningIn(true)
      setError(null)
      
      console.log('[LoginCompact] Sending password reset to:', resetEmail)

      const { error } = await supabase.auth.resetPasswordForEmail(
        resetEmail.trim(),
        { redirectTo: `${window.location.origin}/auth/reset` }
      )

      if (error) {
        console.error('[LoginCompact] Password reset error:', error)
        setError(error.message)
      } else {
        setError(null)
        alert(`Password reset link sent to ${resetEmail}! Check your email and follow the instructions.`)
        setResetEmail('')
        setShowPasswordReset(false)
      }
    } catch (err) {
      console.error('[LoginCompact] Unexpected error:', err)
      setError(`Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setIsSigningIn(false)
    }
  }

  if (loading) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        backgroundColor: '#f3f4f6'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '32px', marginBottom: '16px' }}>⏳</div>
          <p style={{ color: '#6b7280' }}>Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      backgroundColor: '#f3f4f6',
      padding: '16px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      <div style={{
        maxWidth: '320px',
        width: '100%',
        backgroundColor: '#ffffff',
        borderRadius: '16px',
        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
        padding: '24px'
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>🔐</div>
          <h1 style={{ 
            fontSize: '20px', 
            fontWeight: '600', 
            color: '#1f2937', 
            marginBottom: '8px',
            margin: '0'
          }}>
            Sign In
          </h1>
          <p style={{ 
            color: '#6b7280', 
            fontSize: '13px',
            margin: '0'
          }}>
            Choose your authentication method
          </p>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            padding: '12px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            marginBottom: '16px'
          }}>
            <p style={{ 
              color: '#dc2626', 
              fontSize: '12px',
              margin: '0'
            }}>
              {error}
            </p>
          </div>
        )}

        {/* Email/Password Form */}
        {showEmailForm ? (
          <div style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && !isSigningIn && signInWithEmail()}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px',
                  backgroundColor: '#ffffff',
                  boxSizing: 'border-box'
                }}
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && !isSigningIn && signInWithEmail()}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px',
                  backgroundColor: '#ffffff',
                  boxSizing: 'border-box'
                }}
              />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={signInWithEmail}
                  disabled={isSigningIn || !email || !password}
                  style={{
                    flex: '1',
                    padding: '12px 16px',
                    border: 'none',
                    borderRadius: '8px',
                    backgroundColor: '#059669',
                    color: '#ffffff',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: isSigningIn || !email || !password ? 'not-allowed' : 'pointer',
                    opacity: isSigningIn || !email || !password ? 0.6 : 1,
                  }}
                >
                  {isSigningIn ? 'Signing In...' : 'Sign In'}
                </button>
                <button
                  onClick={() => {
                    setShowEmailForm(false)
                    setEmail('')
                    setPassword('')
                    setError(null)
                  }}
                  disabled={isSigningIn}
                  style={{
                    padding: '12px 16px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    backgroundColor: '#ffffff',
                    color: '#374151',
                    fontSize: '14px',
                    cursor: isSigningIn ? 'not-allowed' : 'pointer',
                    opacity: isSigningIn ? 0.6 : 1,
                  }}
                >
                  Cancel
                </button>
              </div>
              <div style={{ textAlign: 'center' }}>
                <button
                  onClick={() => navigate('/signup')}
                  disabled={isSigningIn}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#3b82f6',
                    fontSize: '13px',
                    cursor: isSigningIn ? 'not-allowed' : 'pointer',
                    textDecoration: 'underline',
                    opacity: isSigningIn ? 0.6 : 1,
                  }}
                >
                  Don't have an account? Sign up
                </button>
              </div>
            </div>
          </div>
        ) : showMagicLink ? (
          /* Magic Link Form */
          <div style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input
                type="email"
                placeholder="Enter your email address"
                value={magicLinkEmail}
                onChange={(e) => setMagicLinkEmail(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && !isSigningIn && signInWithMagicLink()}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px',
                  backgroundColor: '#ffffff',
                  boxSizing: 'border-box'
                }}
              />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={signInWithMagicLink}
                  disabled={isSigningIn || !magicLinkEmail}
                  style={{
                    flex: '1',
                    padding: '12px 16px',
                    border: 'none',
                    borderRadius: '8px',
                    backgroundColor: '#7c3aed',
                    color: '#ffffff',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: isSigningIn || !magicLinkEmail ? 'not-allowed' : 'pointer',
                    opacity: isSigningIn || !magicLinkEmail ? 0.6 : 1,
                  }}
                >
                  {isSigningIn ? 'Sending...' : 'Send Magic Link'}
                </button>
                <button
                  onClick={() => {
                    setShowMagicLink(false)
                    setMagicLinkEmail('')
                    setError(null)
                  }}
                  disabled={isSigningIn}
                  style={{
                    padding: '12px 16px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    backgroundColor: '#ffffff',
                    color: '#374151',
                    fontSize: '14px',
                    cursor: isSigningIn ? 'not-allowed' : 'pointer',
                    opacity: isSigningIn ? 0.6 : 1,
                  }}
                >
                  Cancel
                </button>
              </div>
              <div style={{ textAlign: 'center', fontSize: '12px', color: '#6b7280' }}>
                We'll send you a secure link to sign in without a password
              </div>
            </div>
          </div>
        ) : showPasswordReset ? (
          /* Password Reset Form */
          <div style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input
                type="email"
                placeholder="Enter your email address"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && !isSigningIn && resetPassword()}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px',
                  backgroundColor: '#ffffff',
                  boxSizing: 'border-box'
                }}
              />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={resetPassword}
                  disabled={isSigningIn || !resetEmail}
                  style={{
                    flex: '1',
                    padding: '12px 16px',
                    border: 'none',
                    borderRadius: '8px',
                    backgroundColor: '#dc2626',
                    color: '#ffffff',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: isSigningIn || !resetEmail ? 'not-allowed' : 'pointer',
                    opacity: isSigningIn || !resetEmail ? 0.6 : 1,
                  }}
                >
                  {isSigningIn ? 'Sending...' : 'Reset Password'}
                </button>
                <button
                  onClick={() => {
                    setShowPasswordReset(false)
                    setResetEmail('')
                    setError(null)
                  }}
                  disabled={isSigningIn}
                  style={{
                    padding: '12px 16px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    backgroundColor: '#ffffff',
                    color: '#374151',
                    fontSize: '14px',
                    cursor: isSigningIn ? 'not-allowed' : 'pointer',
                    opacity: isSigningIn ? 0.6 : 1,
                  }}
                >
                  Cancel
                </button>
              </div>
              <div style={{ textAlign: 'center', fontSize: '12px', color: '#6b7280' }}>
                We'll send you instructions to reset your password
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Auth Method Toggles */}
            <div style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                onClick={() => {
                  setShowEmailForm(true)
                  setShowMagicLink(false)
                  setShowPasswordReset(false)
                  setError(null)
                }}
                disabled={isSigningIn}
                style={{
                  width: '100%',
                  padding: '10px 16px',
                  border: '2px solid #059669',
                  borderRadius: '8px',
                  backgroundColor: '#f0fdf4',
                  fontSize: '13px',
                  fontWeight: '600',
                  color: '#059669',
                  cursor: isSigningIn ? 'not-allowed' : 'pointer',
                  opacity: isSigningIn ? 0.6 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                📧 Email & Password
              </button>
              
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => {
                    setShowMagicLink(true)
                    setShowEmailForm(false)
                    setShowPasswordReset(false)
                    setError(null)
                  }}
                  disabled={isSigningIn}
                  style={{
                    flex: '1',
                    padding: '10px 16px',
                    border: '2px solid #7c3aed',
                    borderRadius: '8px',
                    backgroundColor: '#faf5ff',
                    fontSize: '13px',
                    fontWeight: '600',
                    color: '#7c3aed',
                    cursor: isSigningIn ? 'not-allowed' : 'pointer',
                    opacity: isSigningIn ? 0.6 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  🪄 Magic Link
                </button>
                
                <button
                  onClick={() => {
                    setShowPasswordReset(true)
                    setShowEmailForm(false)
                    setShowMagicLink(false)
                    setError(null)
                  }}
                  disabled={isSigningIn}
                  style={{
                    flex: '1',
                    padding: '10px 16px',
                    border: '2px solid #dc2626',
                    borderRadius: '8px',
                    backgroundColor: '#fef2f2',
                    fontSize: '13px',
                    fontWeight: '600',
                    color: '#dc2626',
                    cursor: isSigningIn ? 'not-allowed' : 'pointer',
                    opacity: isSigningIn ? 0.6 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  🔑 Reset
                </button>
              </div>
            </div>

            {/* Separator */}
            <div style={{ 
              position: 'relative',
              margin: '16px 0',
              textAlign: 'center'
            }}>
              <div style={{ 
                position: 'absolute',
                top: '50%',
                left: '0',
                right: '0',
                height: '1px',
                backgroundColor: '#e5e7eb'
              }} />
              <span style={{ 
                backgroundColor: '#ffffff',
                color: '#6b7280',
                fontSize: '12px',
                padding: '0 12px'
              }}>
                or continue with
              </span>
            </div>
          </>
        )}

        {/* OAuth Buttons Container */}
        {!showEmailForm && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* GitHub */}
          <button
            onClick={() => signInWithProvider('github')}
            disabled={isSigningIn}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '10px 16px',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              backgroundColor: '#ffffff',
              fontSize: '14px',
              fontWeight: '500',
              color: '#374151',
              cursor: isSigningIn ? 'not-allowed' : 'pointer',
              opacity: isSigningIn ? 0.6 : 1,
              gap: '8px'
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            GitHub
          </button>

          {/* Google */}
          <button
            onClick={() => signInWithProvider('google')}
            disabled={isSigningIn}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '10px 16px',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              backgroundColor: '#ffffff',
              fontSize: '14px',
              fontWeight: '500',
              color: '#374151',
              cursor: isSigningIn ? 'not-allowed' : 'pointer',
              opacity: isSigningIn ? 0.6 : 1,
              gap: '8px'
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Google
          </button>

          {/* Facebook */}
          <button
            onClick={() => signInWithProvider('facebook')}
            disabled={isSigningIn}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '10px 16px',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              backgroundColor: '#ffffff',
              fontSize: '14px',
              fontWeight: '500',
              color: '#374151',
              cursor: isSigningIn ? 'not-allowed' : 'pointer',
              opacity: isSigningIn ? 0.6 : 1,
              gap: '8px'
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#1877F2">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
            Facebook
          </button>

          {/* LinkedIn */}
          <button
            onClick={() => signInWithProvider('linkedin_oidc')}
            disabled={isSigningIn}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '10px 16px',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              backgroundColor: '#ffffff',
              fontSize: '14px',
              fontWeight: '500',
              color: '#374151',
              cursor: isSigningIn ? 'not-allowed' : 'pointer',
              opacity: isSigningIn ? 0.6 : 1,
              gap: '8px'
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#0A66C2">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
            </svg>
            LinkedIn
          </button>
          </div>
        )}

        {/* Footer */}
        <div style={{ 
          textAlign: 'center', 
          marginTop: '20px',
          paddingTop: '16px',
          borderTop: '1px solid #e5e7eb'
        }}>
          <p style={{ 
            color: '#9ca3af', 
            fontSize: '11px',
            margin: '0'
          }}>
            Powered by Supabase Auth
          </p>
        </div>
      </div>
    </div>
  )
}