import React, { useState } from 'react';
import { Stack, Button, TextInput, Radio, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { ServerConfig } from '@app/services/connectionModeService';
import { connectionModeService } from '@app/services/connectionModeService';
import { STIRLING_SAAS_URL } from '@app/constants/connection';

interface ServerSelectionProps {
  onSelect: (config: ServerConfig) => void;
  loading: boolean;
}

export const ServerSelection: React.FC<ServerSelectionProps> = ({ onSelect, loading }) => {
  const { t } = useTranslation();
  const [serverType, setServerType] = useState<'saas' | 'selfhosted'>('saas');
  const [customUrl, setCustomUrl] = useState('');
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  const handleContinue = async () => {
    const url = serverType === 'saas' ? STIRLING_SAAS_URL : customUrl.trim();

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
        server_type: serverType,
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
    <Stack gap="md" mt="lg">
      <Radio.Group value={serverType} onChange={(value) => setServerType(value as 'saas' | 'selfhosted')}>
        <Stack gap="xs">
          <Radio value="saas" label={t('setup.server.type.saas', 'Stirling PDF SaaS (stirling.com/app)')} />
          <Radio value="selfhosted" label={t('setup.server.type.selfhosted', 'Self-hosted server')} />
        </Stack>
      </Radio.Group>

      {serverType === 'selfhosted' && (
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
      )}

      {testError && (
        <Text c="red" size="sm">
          {testError}
        </Text>
      )}

      <Button onClick={handleContinue} loading={testing || loading} disabled={loading} mt="md">
        {testing
          ? t('setup.server.testing', 'Testing connection...')
          : t('common.continue', 'Continue')}
      </Button>
    </Stack>
  );
};
