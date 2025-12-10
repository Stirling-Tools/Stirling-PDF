import React, { useState } from 'react';
import { Stack, Button, TextInput, Alert, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { ServerConfig } from '@app/services/connectionModeService';
import { connectionModeService } from '@app/services/connectionModeService';
import LocalIcon from '@app/components/shared/LocalIcon';

interface ServerSelectionProps {
  onSelect: (config: ServerConfig) => void;
  loading: boolean;
}

export const ServerSelection: React.FC<ServerSelectionProps> = ({ onSelect, loading }) => {
  const { t } = useTranslation();
  const [customUrl, setCustomUrl] = useState('');
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [securityDisabled, setSecurityDisabled] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Normalize URL: trim and remove trailing slashes
    const url = customUrl.trim().replace(/\/+$/, '');

    if (!url) {
      setTestError(t('setup.server.error.emptyUrl', 'Please enter a server URL'));
      return;
    }

    // Test connection before proceeding
    setTesting(true);
    setTestError(null);
    setSecurityDisabled(false);

    try {
      const isReachable = await connectionModeService.testConnection(url);

      if (!isReachable) {
        setTestError(t('setup.server.error.unreachable', 'Could not connect to server'));
        setTesting(false);
        return;
      }

      // Fetch OAuth providers and check if login is enabled
      let enabledProviders: string[] = [];
      try {
        const response = await fetch(`${url}/api/v1/proprietary/ui-data/login`);

        // Check if security is disabled (status 403 or error response)
        if (!response.ok) {
          if (response.status === 403 || response.status === 401) {
            setSecurityDisabled(true);
            setTesting(false);
            return;
          }
          // Other error statuses - show generic error
          setTestError(
            t('setup.server.error.configFetch', 'Failed to fetch server configuration (status {{status}})', {
              status: response.status
            })
          );
          setTesting(false);
          return;
        }

        const data = await response.json();
        console.log('Login UI data:', data);

        // Check if the response indicates security is disabled
        if (data.enableLogin === false || data.securityEnabled === false) {
          setSecurityDisabled(true);
          setTesting(false);
          return;
        }

        // Extract provider IDs from authorization URLs
        // Example: "/oauth2/authorization/google" → "google"
        enabledProviders = Object.keys(data.providerList || {})
          .map(key => key.split('/').pop())
          .filter((id): id is string => id !== undefined);

        console.log('[ServerSelection] Detected OAuth providers:', enabledProviders);
      } catch (err) {
        console.error('[ServerSelection] Failed to fetch login configuration', err);

        // Check if it's a security disabled error
        if (err instanceof Error && (err.message.includes('403') || err.message.includes('401'))) {
          setSecurityDisabled(true);
          setTesting(false);
          return;
        }

        // For any other error (network, CORS, invalid JSON, etc.), show error and don't proceed
        setTestError(
          t('setup.server.error.configFetch', 'Failed to fetch server configuration. Please check the URL and try again.')
        );
        setTesting(false);
        return;
      }

      // Connection successful - pass URL and OAuth providers
      onSelect({
        url,
        enabledOAuthProviders: enabledProviders.length > 0 ? enabledProviders : undefined,
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
            setSecurityDisabled(false);
          }}
          disabled={loading || testing}
          error={testError}
          description={t(
            'setup.server.url.description',
            'Enter the full URL of your self-hosted Stirling PDF server'
          )}
        />

        {securityDisabled && (
          <Alert
            variant="light"
            color="orange"
            icon={<LocalIcon icon="warning-rounded" width="1.25rem" height="1.25rem" />}
            title={t('setup.server.error.securityDisabled.title', 'Login Not Enabled')}
          >
            <Stack gap="sm">
              <Text size="sm">
                {t('setup.server.error.securityDisabled.body', 'This server does not have login enabled. To connect to this server, you must enable authentication:')}
              </Text>
              <Text size="sm" component="div">
                <ol style={{ margin: 0, paddingLeft: '1.5rem' }}>
                  <li>{t('setup.server.error.securityDisabled.step1', 'Set DOCKER_ENABLE_SECURITY=true in your environment')}</li>
                  <li>{t('setup.server.error.securityDisabled.step2', 'Or set security.enableLogin=true in settings.yml')}</li>
                  <li>{t('setup.server.error.securityDisabled.step3', 'Restart the server')}</li>
                </ol>
              </Text>
            </Stack>
          </Alert>
        )}

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
