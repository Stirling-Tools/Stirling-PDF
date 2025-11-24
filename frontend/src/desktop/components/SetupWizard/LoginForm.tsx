import React, { useState } from 'react';
import { Stack, TextInput, PasswordInput, Button, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';

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

  return (
    <form onSubmit={handleSubmit}>
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {t('setup.login.connectingTo', 'Connecting to:')} <strong>{isSaaS ? 'stirling.com' : serverUrl}</strong>
        </Text>

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
