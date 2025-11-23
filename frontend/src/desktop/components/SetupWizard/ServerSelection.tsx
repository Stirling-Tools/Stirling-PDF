import React, { useState } from 'react';
import { Stack, Button, TextInput } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { ServerConfig } from '@app/services/connectionModeService';
import { connectionModeService } from '@app/services/connectionModeService';

interface ServerSelectionProps {
  onSelect: (config: ServerConfig) => void;
  loading: boolean;
}

export const ServerSelection: React.FC<ServerSelectionProps> = ({ onSelect, loading }) => {
  const { t } = useTranslation();
  const [customUrl, setCustomUrl] = useState('');
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const url = customUrl.trim();

    if (!url) {
      setTestError(t('setup.server.error.emptyUrl', 'Please enter a server URL'));
      return;
    }

    // Test connection before proceeding
    setTesting(true);
    setTestError(null);

    try {
      const isReachable = await connectionModeService.testConnection(url);

      if (!isReachable) {
        setTestError(t('setup.server.error.unreachable', 'Could not connect to server'));
        setTesting(false);
        return;
      }

      // Connection successful
      onSelect({
        url,
      });
    } catch (error) {
      console.error('Connection test failed:', error);
      setTestError(
        error instanceof Error
          ? error.message
          : t('setup.server.error.testFailed', 'Connection test failed')
      );
    } finally {
      setTesting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Stack gap="md">
        <TextInput
          label={t('setup.server.url.label', 'Server URL')}
          placeholder="https://your-server.com"
          value={customUrl}
          onChange={(e) => {
            setCustomUrl(e.target.value);
            setTestError(null);
          }}
          disabled={loading || testing}
          error={testError}
          description={t(
            'setup.server.url.description',
            'Enter the full URL of your self-hosted Stirling PDF server'
          )}
        />

        <Button
          type="submit"
          loading={testing || loading}
          disabled={loading}
          mt="md"
          fullWidth
          color="#AF3434"
        >
          {testing
            ? t('setup.server.testing', 'Testing connection...')
            : t('common.continue', 'Continue')}
        </Button>
      </Stack>
    </form>
  );
};
