import React, { useState } from 'react';
import { Stack, TextInput, PasswordInput, Button, Text, Divider, Group } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { authService } from '@app/services/authService';

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
      setValidationError(t('setup.login.error.emptyUsername', 'Please enter your username'));
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
    try {
      setOauthLoading(true);
      setValidationError(null);

      // For SaaS, use auth.stirling.com; for self-hosted, derive from serverUrl
      const authServerUrl = isSaaS
        ? 'https://auth.stirling.com'
        : serverUrl; // Self-hosted might have its own auth

      const userInfo = await authService.loginWithOAuth(provider, authServerUrl);

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
                  leftSection={
                    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
                      <path d="M9.003 18c2.43 0 4.467-.806 5.956-2.18L12.05 13.56c-.806.54-1.836.86-3.047.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9.003 18z" fill="#34A853"/>
                      <path d="M3.964 10.712c-.18-.54-.282-1.117-.282-1.71 0-.593.102-1.17.282-1.71V4.96H.957C.347 6.175 0 7.55 0 9.002c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                      <path d="M9.003 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.464.891 11.427 0 9.002 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29c.708-2.127 2.692-3.71 5.036-3.71z" fill="#EA4335"/>
                    </svg>
                  }
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
                  leftSection={
                    <svg width="18" height="18" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
                      <path fillRule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
                    </svg>
                  }
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
          label={t('setup.login.username.label', 'Username')}
          placeholder={t('setup.login.username.placeholder', 'Enter your username')}
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
