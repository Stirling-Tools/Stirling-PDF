import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDocumentMeta } from '../hooks/useDocumentMeta';
import AuthLayout from './authShared/AuthLayout';
import LoginHeader from './login/LoginHeader';
import ErrorMessage from './login/ErrorMessage';
import { BASE_PATH } from '../constants/app';
import apiClient from '../services/apiClient';

interface InviteData {
  email: string | null;
  role: string;
  expiresAt: string;
  emailRequired: boolean;
}

export default function InviteAccept() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [inviteData, setInviteData] = useState<InviteData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const baseUrl = window.location.origin + BASE_PATH;

  // Set document meta
  useDocumentMeta({
    title: `${t('invite.welcome', 'Welcome to Stirling PDF')} - Stirling PDF`,
    description: t('app.description', 'The Free Adobe Acrobat alternative (10M+ Downloads)'),
    ogTitle: `${t('invite.welcome', 'Welcome to Stirling PDF')} - Stirling PDF`,
    ogDescription: t('app.description', 'The Free Adobe Acrobat alternative (10M+ Downloads)'),
    ogImage: `${baseUrl}/og_images/home.png`,
    ogUrl: `${window.location.origin}${window.location.pathname}`
  });

  useEffect(() => {
    if (!token) {
      setError(t('invite.invalidToken', 'Invalid invitation link'));
      setLoading(false);
      return;
    }

    validateToken();
  }, [token]);

  const validateToken = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get<InviteData>(`/api/v1/invite/validate/${token}`, {
        suppressErrorToast: true,
      } as any);
      setInviteData(response.data);
      setError(null);
    } catch (err: any) {
      const errorMessage =
        err.response?.data?.error ||
        err.message ||
        t('invite.validationError', 'Failed to validate invitation link');
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate email if required
    if (inviteData?.emailRequired) {
      if (!email || email.trim().length === 0) {
        setError(t('invite.emailRequired', 'Email address is required'));
        return;
      }
      if (!email.includes('@')) {
        setError(t('invite.invalidEmail', 'Invalid email address'));
        return;
      }
    }

    // Validate passwords
    if (!password) {
      setError(t('invite.passwordRequired', 'Password is required'));
      return;
    }

    if (password !== confirmPassword) {
      setError(t('invite.passwordMismatch', 'Passwords do not match'));
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const formData = new FormData();
      if (inviteData?.emailRequired) {
        formData.append('email', email.trim().toLowerCase());
      }
      formData.append('password', password);

      await apiClient.post(`/api/v1/invite/accept/${token}`, formData, {
        suppressErrorToast: true,
      } as any);

      // Success - redirect to login
      navigate('/login?messageType=accountCreated');
    } catch (err: any) {
      const errorMessage =
        err.response?.data?.error ||
        err.message ||
        t('invite.acceptError', 'Failed to create account');
      setError(errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <AuthLayout>
        <LoginHeader title={t('invite.validating', 'Validating invitation...')} />
        <div style={{ textAlign: 'center', padding: '3rem 0' }}>
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        </div>
      </AuthLayout>
    );
  }

  if (error && !inviteData) {
    return (
      <AuthLayout>
        <LoginHeader title={t('invite.invalidInvitation', 'Invalid Invitation')} />
        <ErrorMessage error={error} />
        <div className="auth-section">
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="w-full px-4 py-[0.75rem] rounded-[0.625rem] text-base font-semibold cursor-pointer border-0 auth-cta-button"
          >
            {t('invite.goToLogin', 'Go to Login')}
          </button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <LoginHeader
        title={t('invite.welcomeTitle', "You've been invited!")}
        subtitle={t('invite.welcomeSubtitle', 'Complete your account setup to get started')}
      />

      {inviteData && !inviteData.emailRequired && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{
            textAlign: 'center',
            padding: '1.25rem',
            backgroundColor: 'rgba(59, 130, 246, 0.08)',
            borderRadius: '0.75rem',
            border: '1px solid rgba(59, 130, 246, 0.2)'
          }}>
            <p style={{
              fontSize: '0.8125rem',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: '#6b7280',
              margin: '0 0 0.5rem 0',
              fontWeight: 500
            }}>
              {t('invite.accountFor', 'Creating account for')}
            </p>
            <p style={{
              fontSize: '1.125rem',
              fontWeight: 600,
              margin: '0 0 0.75rem 0',
              color: '#1f2937'
            }}>
              {inviteData.email}
            </p>
            <p style={{
              fontSize: '0.8125rem',
              color: '#6b7280',
              margin: 0
            }}>
              {t('invite.linkExpires', 'Link expires')}: {new Date(inviteData.expiresAt).toLocaleDateString()} at {new Date(inviteData.expiresAt).toLocaleTimeString()}
            </p>
          </div>
        </div>
      )}

      <ErrorMessage error={error} />

      <form onSubmit={handleAccept}>
        {inviteData?.emailRequired && (
          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="email" className="auth-label">
              {t('invite.email', 'Email address')}
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('invite.emailPlaceholder', 'Enter your email address')}
              disabled={submitting}
              required
              className="auth-input"
              autoComplete="email"
            />
          </div>
        )}

        <div style={{ marginBottom: '1rem' }}>
          <label htmlFor="password" className="auth-label">
            {t('invite.choosePassword', 'Choose a password')}
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('invite.passwordPlaceholder', 'Enter your password')}
            disabled={submitting}
            required
            className="auth-input"
            autoComplete="new-password"
          />
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <label htmlFor="confirmPassword" className="auth-label">
            {t('invite.confirmPassword', 'Confirm password')}
          </label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder={t('invite.confirmPasswordPlaceholder', 'Re-enter your password')}
            disabled={submitting}
            required
            className="auth-input"
            autoComplete="new-password"
          />
        </div>

        <div className="auth-section">
          <button
            type="submit"
            disabled={submitting}
            className="w-full px-4 py-[0.75rem] rounded-[0.625rem] text-base font-semibold cursor-pointer border-0 disabled:opacity-50 disabled:cursor-not-allowed auth-cta-button"
          >
            {submitting ? t('invite.creating', 'Creating Account...') : t('invite.createAccount', 'Create Account')}
          </button>
        </div>
      </form>

      <div style={{ textAlign: 'center', margin: '1rem 0 0' }}>
        <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: 0 }}>
          {t('invite.alreadyHaveAccount', 'Already have an account?')}{' '}
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="auth-link-black"
          >
            {t('invite.signIn', 'Sign in')}
          </button>
        </p>
      </div>
    </AuthLayout>
  );
}
