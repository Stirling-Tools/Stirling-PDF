import React, { useState } from 'react';
import { Stack, TextInput, PasswordInput, Button, Text, Divider, Group } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { authService } from '@app/services/authService';
import { STIRLING_SAAS_URL } from '@app/constants/connection';
import { buildOAuthCallbackHtml } from '@app/utils/oauthCallbackHtml';
import { BASE_PATH } from '@app/constants/app';

interface LoginFormProps {
  serverUrl: string;
  isSaaS?: boolean;
  onLogin: (username: string, password: string) => Promise<void>;
  loading: boolean;
}

export const LoginForm: React.FC<LoginFormProps> = ({ serverUrl, isSaaS = false, onLogin, loading }) => {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [oauthLoading, setOauthLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!username.trim()) {
      setValidationError(isSaaS
        ? t('setup.login.error.emptyEmail', 'Please enter your email')
        : t('setup.login.error.emptyUsername', 'Please enter your username'));
      return;
    }

    if (!password) {
      setValidationError(t('setup.login.error.emptyPassword', 'Please enter your password'));
      return;
    }

    setValidationError(null);
    await onLogin(username.trim(), password);
  };

  const handleOAuthLogin = async (provider: 'google' | 'github') => {
    // Prevent concurrent OAuth attempts
    if (oauthLoading || loading) {
      return;
    }

    try {
      setOauthLoading(true);
      setValidationError(null);

      // For SaaS, use configured SaaS URL; for self-hosted, derive from serverUrl
      const authServerUrl = isSaaS
        ? STIRLING_SAAS_URL
        : serverUrl; // Self-hosted might have its own auth

      // Build callback page HTML with translations and dark mode support
      const successHtml = buildOAuthCallbackHtml({
        title: t('oauth.success.title', 'Authentication Successful'),
        message: t('oauth.success.message', 'You can close this window and return to Stirling PDF.'),
        isError: false,
      });

      const errorHtml = buildOAuthCallbackHtml({
        title: t('oauth.error.title', 'Authentication Failed'),
        message: t('oauth.error.message', 'Authentication was not successful. You can close this window and try again.'),
        isError: true,
        errorPlaceholder: true, // {error} will be replaced by Rust
      });

      const userInfo = await authService.loginWithOAuth(provider, authServerUrl, successHtml, errorHtml);

      // Call the onLogin callback to complete setup (username/password not needed for OAuth)
      await onLogin(userInfo.username, '');
    } catch (error) {
      console.error('OAuth login failed:', error);

      const errorMessage = error instanceof Error
        ? error.message
        : t('setup.login.error.oauthFailed', 'OAuth login failed. Please try again.');

      setValidationError(errorMessage);
      setOauthLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {t('setup.login.connectingTo', 'Connecting to:')} <strong>{isSaaS ? 'stirling.com' : serverUrl}</strong>
        </Text>

        {/* OAuth Login Buttons - Only show for SaaS */}
        {isSaaS && (
          <>
            <Stack gap="xs">
              <Group grow>
                <Button
                  variant="default"
                  leftSection={<img src={`${BASE_PATH}/Login/google.svg`} alt="Google" width={18} height={18} />}
                  onClick={() => handleOAuthLogin('google')}
                  disabled={loading || oauthLoading}
                  styles={{
                    root: { height: '42px' },
                  }}
                >
                  {t('setup.login.signInWith', 'Sign in with')} Google
                </Button>

                <Button
                  variant="default"
                  leftSection={<img src={`${BASE_PATH}/Login/github.svg`} alt="GitHub" width={18} height={18} />}
                  onClick={() => handleOAuthLogin('github')}
                  disabled={loading || oauthLoading}
                  styles={{
                    root: { height: '42px' },
                  }}
                >
                  {t('setup.login.signInWith', 'Sign in with')} GitHub
                </Button>
              </Group>

              {oauthLoading && (
                <Text size="sm" c="dimmed" ta="center">
                  {t('setup.login.oauthPending', 'Opening browser for authentication...')}
                </Text>
              )}
            </Stack>

            <Divider label={t('setup.login.orContinueWith', 'Or continue with email')} labelPosition="center" />
          </>
        )}

        <TextInput
          label={isSaaS
            ? t('setup.login.email.label', 'Email')
            : t('setup.login.username.label', 'Username')}
          placeholder={isSaaS
            ? t('setup.login.email.placeholder', 'Enter your email')
            : t('setup.login.username.placeholder', 'Enter your username')}
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            setValidationError(null);
          }}
          disabled={loading}
          required
        />

        <PasswordInput
          label={t('setup.login.password.label', 'Password')}
          placeholder={t('setup.login.password.placeholder', 'Enter your password')}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setValidationError(null);
          }}
          disabled={loading}
          required
        />

        {validationError && (
          <Text c="red" size="sm">
            {validationError}
          </Text>
        )}

        <Button
          type="submit"
          loading={loading}
          disabled={loading}
          mt="md"
          fullWidth
          color="#AF3434"
        >
          {t('setup.login.submit', 'Login')}
        </Button>
      </Stack>
    </form>
  );
};
