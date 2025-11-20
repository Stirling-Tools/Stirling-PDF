import React, { useState, useEffect } from 'react';
import { Stack, Card, Badge, Button, Text, Group, Modal, TextInput, Radio } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import {
  connectionModeService,
  ConnectionConfig,
  ServerConfig,
} from '@app/services/connectionModeService';
import { authService, UserInfo } from '@app/services/authService';
import { LoginForm } from '@app/components/SetupWizard/LoginForm';
import { STIRLING_SAAS_URL } from '@app/constants/connection';
import { Z_INDEX_OVER_CONFIG_MODAL } from '@app/styles/zIndex';

export const ConnectionSettings: React.FC = () => {
  const { t } = useTranslation();
  const [config, setConfig] = useState<ConnectionConfig | null>(null);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [showServerModal, setShowServerModal] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [newServerConfig, setNewServerConfig] = useState<ServerConfig | null>(null);

  // Load current config on mount
  useEffect(() => {
    const loadConfig = async () => {
      const currentConfig = await connectionModeService.getCurrentConfig();
      setConfig(currentConfig);

      if (currentConfig.mode === 'saas' || currentConfig.mode === 'selfhosted') {
        const user = await authService.getUserInfo();
        setUserInfo(user);
      }
    };

    loadConfig();
  }, []);

  const handleSwitchToSaaS = async () => {
    try {
      setLoading(true);
      await connectionModeService.switchToSaaS(STIRLING_SAAS_URL);

      // Reload config
      const newConfig = await connectionModeService.getCurrentConfig();
      setConfig(newConfig);
      setUserInfo(null);

      // Reload the page to start the local backend
      window.location.reload();
    } catch (error) {
      console.error('Failed to switch to SaaS:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchToServer = () => {
    setShowServerModal(true);
  };

  const handleServerConfigSubmit = (serverConfig: ServerConfig) => {
    setNewServerConfig(serverConfig);
    setShowServerModal(false);
    setShowLoginModal(true);
  };

  const handleLogin = async (username: string, password: string) => {
    if (!newServerConfig) return;

    try {
      setLoading(true);

      // Login
      await authService.login(newServerConfig.url, username, password);

      // Switch to self-hosted mode
      await connectionModeService.switchToSelfHosted(newServerConfig);

      // Reload config and user info
      const newConfig = await connectionModeService.getCurrentConfig();
      setConfig(newConfig);
      const user = await authService.getUserInfo();
      setUserInfo(user);

      setShowLoginModal(false);
      setNewServerConfig(null);

      // Reload the page to stop local backend and initialize external backend monitoring
      window.location.reload();
    } catch (error) {
      console.error('Login failed:', error);
      throw error; // Let LoginForm handle the error
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      setLoading(true);
      await authService.logout();

      // Switch to SaaS mode
      await connectionModeService.switchToSaaS(STIRLING_SAAS_URL);

      // Reload config
      const newConfig = await connectionModeService.getCurrentConfig();
      setConfig(newConfig);
      setUserInfo(null);

      // Reload the page to clear all state and reconnect to local backend
      window.location.reload();
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!config) {
    return <Text>{t('common.loading', 'Loading...')}</Text>;
  }

  return (
    <>
      <Card shadow="sm" padding="lg" radius="md" withBorder>
        <Stack gap="md">
          <Group justify="space-between">
            <Text fw={600}>{t('settings.connection.title', 'Connection Mode')}</Text>
            <Badge color={config.mode === 'saas' ? 'blue' : 'green'} variant="light">
              {config.mode === 'saas'
                ? t('settings.connection.mode.saas', 'SaaS')
                : t('settings.connection.mode.selfhosted', 'Self-Hosted')}
            </Badge>
          </Group>

          {(config.mode === 'saas' || config.mode === 'selfhosted') && config.server_config && (
            <>
              <div>
                <Text size="sm" fw={500}>
                  {t('settings.connection.server', 'Server')}
                </Text>
                <Text size="sm" c="dimmed">
                  {config.server_config.url}
                </Text>
              </div>

              {userInfo && (
                <div>
                  <Text size="sm" fw={500}>
                    {t('settings.connection.user', 'Logged in as')}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {userInfo.username}
                    {userInfo.email && ` (${userInfo.email})`}
                  </Text>
                </div>
              )}
            </>
          )}

          <Group mt="md">
            {config.mode === 'saas' ? (
              <Button onClick={handleSwitchToServer} disabled={loading}>
                {t('settings.connection.switchToSelfHosted', 'Switch to Self-Hosted')}
              </Button>
            ) : (
              <>
                <Button onClick={handleSwitchToSaaS} variant="default" disabled={loading}>
                  {t('settings.connection.switchToSaaS', 'Switch to SaaS')}
                </Button>
                <Button onClick={handleLogout} color="red" variant="light" disabled={loading}>
                  {t('settings.connection.logout', 'Logout')}
                </Button>
              </>
            )}
          </Group>
        </Stack>
      </Card>

      {/* Server selection modal */}
      <Modal
        opened={showServerModal}
        onClose={() => setShowServerModal(false)}
        title={t('settings.connection.selectServer', 'Select Server')}
        zIndex={Z_INDEX_OVER_CONFIG_MODAL}
      >
        <ServerSelectionInSettings onSubmit={handleServerConfigSubmit} />
      </Modal>

      {/* Login modal */}
      <Modal
        opened={showLoginModal}
        onClose={() => {
          setShowLoginModal(false);
          setNewServerConfig(null);
        }}
        title={t('settings.connection.login', 'Login')}
        zIndex={Z_INDEX_OVER_CONFIG_MODAL}
      >
        {newServerConfig && (
          <LoginForm
            serverUrl={newServerConfig.url}
            onLogin={handleLogin}
            loading={loading}
          />
        )}
      </Modal>
    </>
  );
};

// Mini server selection component for settings
const ServerSelectionInSettings: React.FC<{ onSubmit: (config: ServerConfig) => void }> = ({
  onSubmit,
}) => {
  const { t } = useTranslation();
  const [serverType, setServerType] = useState<'saas' | 'selfhosted'>('saas');
  const [customUrl, setCustomUrl] = useState('');
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const url = serverType === 'saas' ? STIRLING_SAAS_URL : customUrl.trim();

    if (!url) {
      setError(t('setup.server.error.emptyUrl', 'Please enter a server URL'));
      return;
    }

    setTesting(true);
    setError(null);

    try {
      const isReachable = await connectionModeService.testConnection(url);

      if (!isReachable) {
        setError(t('setup.server.error.unreachable', 'Could not connect to server'));
        setTesting(false);
        return;
      }

      onSubmit({
        url,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('setup.server.error.testFailed', 'Connection test failed'));
      setTesting(false);
    }
  };

  return (
    <Stack gap="md">
      <Radio.Group value={serverType} onChange={(value) => setServerType(value as 'saas' | 'selfhosted')}>
        <Stack gap="xs">
          <Radio value="saas" label={t('setup.server.type.saas', 'Stirling PDF SaaS')} />
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
            setError(null);
          }}
          disabled={testing}
          error={error}
        />
      )}

      {error && !customUrl && (
        <Text c="red" size="sm">
          {error}
        </Text>
      )}

      <Button onClick={handleSubmit} loading={testing} fullWidth>
        {testing ? t('setup.server.testing', 'Testing...') : t('common.continue', 'Continue')}
      </Button>
    </Stack>
  );
};
