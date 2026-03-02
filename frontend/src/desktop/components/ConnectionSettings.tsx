import React, { useState, useEffect } from 'react';
import { Stack, Card, Badge, Button, Text, Group } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { connectionModeService, ConnectionConfig } from '@app/services/connectionModeService';
import { authService, UserInfo } from '@app/services/authService';
import { STIRLING_SAAS_URL } from '@app/constants/connection';

export const ConnectionSettings: React.FC = () => {
  const { t } = useTranslation();
  const [config, setConfig] = useState<ConnectionConfig | null>(null);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(false);

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

  const handleLogout = async () => {
    try {
      setLoading(true);
      await authService.logout();

      if (!config?.lock_connection_mode) {
        // Switch to SaaS mode
        await connectionModeService.switchToSaaS(STIRLING_SAAS_URL);

        // Reset setup completion to force login screen on reload
        await connectionModeService.resetSetupCompletion();
      }

      // Reload config
      const newConfig = await connectionModeService.getCurrentConfig();
      setConfig(newConfig);
      setUserInfo(null);

      // Clear URL to home page before reload so we don't return to settings after re-login
      window.history.replaceState({}, '', '/');

      // Reload the page to clear all state and show login screen
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
                ? t('settings.connection.mode.saas', 'Stirling Cloud')
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
                  {config.mode === 'saas' ? 'stirling.com' : config.server_config.url}
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
            <Button onClick={handleLogout} color="red" variant="light" disabled={loading}>
              {t('settings.connection.logout', 'Log Out')}
            </Button>
          </Group>
        </Stack>
      </Card>
    </>
  );
};
