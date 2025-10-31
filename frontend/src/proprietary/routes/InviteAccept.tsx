import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Stack, Text, Paper, Center, Loader, TextInput, PasswordInput, Anchor } from '@mantine/core';
import { useDocumentMeta } from '@app/hooks/useDocumentMeta';
import AuthLayout from '@app/routes/authShared/AuthLayout';
import LoginHeader from '@app/routes/login/LoginHeader';
import ErrorMessage from '@app/routes/login/ErrorMessage';
import { BASE_PATH } from '@app/constants/app';
import apiClient from '@app/services/apiClient';

interface InviteData {
  email: string | null;
  role: string;
  expiresAt: string;
  emailRequired: boolean;
}

export default function InviteAccept() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();

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
        <Center py="xl">
          <Loader size="md" />
        </Center>
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
        <Paper withBorder p="md" mb="lg" bg="blue.0" style={{ borderColor: 'var(--mantine-color-blue-3)' }}>
          <Stack gap="xs" align="center">
            <Text size="xs" tt="uppercase" c="dimmed" fw={500} style={{ letterSpacing: '0.05em' }}>
              {t('invite.accountFor', 'Creating account for')}
            </Text>
            <Text size="lg" fw={600}>
              {inviteData.email}
            </Text>
            <Text size="xs" c="dimmed">
              {t('invite.linkExpires', 'Link expires')}: {new Date(inviteData.expiresAt).toLocaleDateString()} at {new Date(inviteData.expiresAt).toLocaleTimeString()}
            </Text>
          </Stack>
        </Paper>
      )}

      <ErrorMessage error={error} />

      <form onSubmit={handleAccept}>
        <Stack gap="md">
          {inviteData?.emailRequired && (
            <TextInput
              label={t('invite.email', 'Email address')}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('invite.emailPlaceholder', 'Enter your email address')}
              disabled={submitting}
              required
              autoComplete="email"
            />
          )}

          <PasswordInput
            label={t('invite.choosePassword', 'Choose a password')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('invite.passwordPlaceholder', 'Enter your password')}
            disabled={submitting}
            required
            autoComplete="new-password"
          />

          <PasswordInput
            label={t('invite.confirmPassword', 'Confirm password')}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder={t('invite.confirmPasswordPlaceholder', 'Re-enter your password')}
            disabled={submitting}
            required
            autoComplete="new-password"
          />

          <div className="auth-section">
            <button
              type="submit"
              disabled={submitting}
              className="w-full px-4 py-[0.75rem] rounded-[0.625rem] text-base font-semibold cursor-pointer border-0 disabled:opacity-50 disabled:cursor-not-allowed auth-cta-button"
            >
              {submitting ? t('invite.creating', 'Creating Account...') : t('invite.createAccount', 'Create Account')}
            </button>
          </div>
        </Stack>
      </form>

      <Center mt="md">
        <Text size="sm" c="dimmed">
          {t('invite.alreadyHaveAccount', 'Already have an account?')}{' '}
          <Anchor component="button" type="button" onClick={() => navigate('/login')} c="dark">
            {t('invite.signIn', 'Sign in')}
          </Anchor>
        </Text>
      </Center>
    </AuthLayout>
  );
}
