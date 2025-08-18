import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Signup() {
  const navigate = useNavigate()
  const [isSigningUp, setIsSigningUp] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const validateForm = () => {
    if (!email || !password || !confirmPassword) {
      setError('Please fill in all fields')
      return false
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return false
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long')
      return false
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address')
      return false
    }

    return true
  }

  const signUp = async () => {
    if (!validateForm()) return

    try {
      setIsSigningUp(true)
      setError(null)
      setSuccess(null)
      
      console.log('[Signup] Creating account for:', email)

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password: password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`
        }
      })

      if (error) {
        console.error('[Signup] Sign up error:', error)
        setError(error.message)
      } else if (data.user) {
        console.log('[Signup] Sign up successful:', data.user)
        
        // Check if email confirmation is required
        if (data.user && !data.session) {
          setSuccess('Check your email for a confirmation link to complete your registration.')
        } else {
          setSuccess('Account created successfully! You can now sign in.')
          setTimeout(() => navigate('/login'), 2000)
        }
      }
    } catch (err) {
      console.error('[Signup] Unexpected error:', err)
      setError(`Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setIsSigningUp(false)
    }
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
        maxWidth: '400px',
        width: '100%',
        backgroundColor: '#ffffff',
        borderRadius: '16px',
        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
        padding: '32px'
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>🚀</div>
          <h1 style={{ 
            fontSize: '24px', 
            fontWeight: '600', 
            color: '#1f2937', 
            marginBottom: '8px',
            margin: '0'
          }}>
            Create Account
          </h1>
          <p style={{ 
            color: '#6b7280', 
            fontSize: '14px',
            margin: '0'
          }}>
            Join Stirling PDF to get started
          </p>
        </div>

        {/* Success Message */}
        {success && (
          <div style={{
            padding: '16px',
            backgroundColor: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: '8px',
            marginBottom: '24px'
          }}>
            <p style={{ 
              color: '#059669', 
              fontSize: '14px',
              margin: '0'
            }}>
              {success}
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{
            padding: '16px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            marginBottom: '24px'
          }}>
            <p style={{ 
              color: '#dc2626', 
              fontSize: '14px',
              margin: '0'
            }}>
              {error}
            </p>
          </div>
        )}

        {/* Form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
          <div>
            <label style={{ 
              display: 'block', 
              fontSize: '14px', 
              fontWeight: '500', 
              color: '#374151',
              marginBottom: '6px'
            }}>
              Email Address
            </label>
            <input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && !isSigningUp && signUp()}
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
          </div>

          <div>
            <label style={{ 
              display: 'block', 
              fontSize: '14px', 
              fontWeight: '500', 
              color: '#374151',
              marginBottom: '6px'
            }}>
              Password
            </label>
            <input
              type="password"
              placeholder="Minimum 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && !isSigningUp && signUp()}
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
          </div>

          <div>
            <label style={{ 
              display: 'block', 
              fontSize: '14px', 
              fontWeight: '500', 
              color: '#374151',
              marginBottom: '6px'
            }}>
              Confirm Password
            </label>
            <input
              type="password"
              placeholder="Re-enter your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && !isSigningUp && signUp()}
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
          </div>
        </div>

        {/* Sign Up Button */}
        <button
          onClick={signUp}
          disabled={isSigningUp || !email || !password || !confirmPassword}
          style={{
            width: '100%',
            padding: '14px 16px',
            border: 'none',
            borderRadius: '8px',
            backgroundColor: '#059669',
            color: '#ffffff',
            fontSize: '16px',
            fontWeight: '600',
            cursor: isSigningUp || !email || !password || !confirmPassword ? 'not-allowed' : 'pointer',
            opacity: isSigningUp || !email || !password || !confirmPassword ? 0.6 : 1,
            marginBottom: '20px'
          }}
        >
          {isSigningUp ? 'Creating Account...' : 'Create Account'}
        </button>

        {/* Sign In Link */}
        <div style={{ textAlign: 'center' }}>
          <button
            onClick={() => navigate('/login')}
            disabled={isSigningUp}
            style={{
              background: 'none',
              border: 'none',
              color: '#3b82f6',
              fontSize: '14px',
              cursor: isSigningUp ? 'not-allowed' : 'pointer',
              textDecoration: 'underline',
              opacity: isSigningUp ? 0.6 : 1,
            }}
          >
            Already have an account? Sign in
          </button>
        </div>

        {/* Footer */}
        <div style={{ 
          textAlign: 'center', 
          marginTop: '24px',
          paddingTop: '20px',
          borderTop: '1px solid #e5e7eb'
        }}>
          <p style={{ 
            color: '#9ca3af', 
            fontSize: '12px',
            margin: '0'
          }}>
            By creating an account, you agree to our terms of service
          </p>
        </div>
      </div>
    </div>
  )
}