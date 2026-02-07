import React, { useState } from 'react';
import { Stack, Button, TextInput, Alert, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { ServerConfig, SSOProviderConfig } from '@app/services/connectionModeService';
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
  const serverUrl = localStorage.getItem('server_url') || '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Normalize and validate URL
    let url = customUrl.trim().replace(/\/+$/, '') || serverUrl;

    if (!url) {
      setTestError(t('setup.server.error.emptyUrl', 'Please enter a server URL'));
      return;
    }

    // Auto-add https:// if no protocol specified
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      console.log('[ServerSelection] No protocol specified, adding https://');
      url = `https://${url}`;
      setCustomUrl(url); // Update the input field
    }
    localStorage.setItem('server_url', url);

    // Validate URL format
    try {
      const urlObj = new URL(url);
      console.log('[ServerSelection] Valid URL:', {
        protocol: urlObj.protocol,
        hostname: urlObj.hostname,
        port: urlObj.port,
        pathname: urlObj.pathname,
      });
    } catch (err) {
      console.error('[ServerSelection] Invalid URL format:', err);
      setTestError(t('setup.server.error.invalidUrl', 'Invalid URL format. Please enter a valid URL like https://your-server.com'));
      return;
    }

    // Test connection before proceeding
    setTesting(true);
    setTestError(null);
    setSecurityDisabled(false);

    console.log(`[ServerSelection] Testing connection to: ${url}`);

    try {
      const testResult = await connectionModeService.testConnection(url);

      if (!testResult.success) {
        console.error('[ServerSelection] Connection test failed:', testResult);
        setTestError(testResult.error || t('setup.server.error.unreachable', 'Could not connect to server'));
        setTesting(false);
        return;
      }

      console.log('[ServerSelection] ✅ Connection test successful');

      // Fetch OAuth providers and check if login is enabled
      const enabledProviders: SSOProviderConfig[] = [];
      let loginMethod = 'all'; // Default to 'all' (allows both SSO and username/password)
      try {
        console.log('[ServerSelection] Fetching login configuration...');
        const response = await fetch(`${url}/api/v1/proprietary/ui-data/login`);

        // Check if security is disabled (status 403, 401, or 404 - endpoint doesn't exist)
        if (!response.ok) {
          console.warn(`[ServerSelection] Login config request failed with status ${response.status}`);

          if (response.status === 403 || response.status === 401 || response.status === 404) {
            console.log('[ServerSelection] Security/SSO not configured on this server (or endpoint does not exist)');
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
        console.log('[ServerSelection] Login UI data:', data);

        // Check if the response indicates security is disabled
        if (data.enableLogin === false || data.securityEnabled === false) {
          console.log('[ServerSelection] Security is explicitly disabled in config');
          setSecurityDisabled(true);
          setTesting(false);
          return;
        }

        // Extract loginMethod from response
        loginMethod = data.loginMethod || 'all';
        console.log('[ServerSelection] Login method:', loginMethod);

        // Extract provider IDs from authorization URLs
        // Example: "/oauth2/authorization/google" → "google"
        const providerEntries = Object.entries(data.providerList || {});
        providerEntries.forEach(([path, label]) => {
          const id = path.split('/').pop();
          if (!id) {
            return;
          }

          enabledProviders.push({
            id,
            path,
            label: typeof label === 'string' ? label : undefined,
          });
        });

        console.log('[ServerSelection] ✅ Detected OAuth providers:', enabledProviders);
      } catch (err) {
        console.error('[ServerSelection] ❌ Failed to fetch login configuration:', err);

        // Check if it's a security disabled error
        if (err instanceof Error && (err.message.includes('403') || err.message.includes('401'))) {
          console.log('[ServerSelection] Security is disabled (error-based detection)');
          setSecurityDisabled(true);
          setTesting(false);
          return;
        }

        // For any other error (network, CORS, invalid JSON, etc.), show error and don't proceed
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        console.error('[ServerSelection] Configuration fetch error details:', errorMessage);

        setTestError(
          t('setup.server.error.configFetch', 'Failed to fetch server configuration: {{error}}', {
            error: errorMessage
          })
        );
        setTesting(false);
        return;
      }

      // Connection successful - pass URL, OAuth providers, and login method
      console.log('[ServerSelection] ✅ Server selection complete, proceeding to login');
      onSelect({
        url,
        enabledOAuthProviders: enabledProviders.length > 0 ? enabledProviders : undefined,
        loginMethod,
      });
    } catch (error) {
      console.error('[ServerSelection] ❌ Unexpected error during connection test:', error);
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

        {serverUrl && (
          <div className="navigation-link-container">
            <button
              type="button"
              className="navigation-link-button"
              disabled={testing || loading}
              onClick={() => {
                setCustomUrl(serverUrl);
              }}
            >
              {t('setup.server.useLast', 'Last used server: {{serverUrl}}', { serverUrl: serverUrl })}
            </button>
          </div>
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
