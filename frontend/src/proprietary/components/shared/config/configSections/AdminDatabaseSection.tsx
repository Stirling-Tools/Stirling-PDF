import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { NumberInput, Switch, Button, Stack, Paper, Text, Loader, Group, TextInput, PasswordInput, Select, Badge } from '@mantine/core';
import { alert } from '@app/components/toast';
import RestartConfirmationModal from '@app/components/shared/config/RestartConfirmationModal';
import { useRestartServer } from '@app/components/shared/config/useRestartServer';
import { useAdminSettings } from '@app/hooks/useAdminSettings';
import PendingBadge from '@app/components/shared/config/PendingBadge';
import { useLoginRequired } from '@app/hooks/useLoginRequired';
import LoginRequiredBanner from '@app/components/shared/config/LoginRequiredBanner';
import apiClient from '@app/services/apiClient';

interface DatabaseSettingsData {
  enableCustomDatabase?: boolean;
  customDatabaseUrl?: string;
  username?: string;
  password?: string;
  type?: string;
  hostName?: string;
  port?: number;
  name?: string;
}

export default function AdminDatabaseSection() {
  const { t } = useTranslation();
  const { loginEnabled, validateLoginEnabled, getDisabledStyles } = useLoginRequired();
  const { restartModalOpened, showRestartModal, closeRestartModal, restartServer } = useRestartServer();

  const {
    settings,
    setSettings,
    loading,
    saving,
    fetchSettings,
    saveSettings,
    isFieldPending,
  } = useAdminSettings<DatabaseSettingsData>({
    sectionName: 'database',
    fetchTransformer: async () => {
      const response = await apiClient.get('/api/v1/admin/settings/section/system');
      const systemData = response.data || {};

      // Extract datasource from system response and handle pending
      const datasource = systemData.datasource || {
        enableCustomDatabase: false,
        customDatabaseUrl: '',
        username: '',
        password: '',
        type: 'postgresql',
        hostName: 'localhost',
        port: 5432,
        name: 'postgres'
      };

      // Map pending changes from system._pending.datasource to root level
      const result: any = { ...datasource };
      if (systemData._pending?.datasource) {
        result._pending = systemData._pending.datasource;
      }

      return result;
    },
    saveTransformer: (settings) => {
      // Convert flat settings to dot-notation for delta endpoint
      const deltaSettings: Record<string, any> = {
        'system.datasource.enableCustomDatabase': settings.enableCustomDatabase,
        'system.datasource.customDatabaseUrl': settings.customDatabaseUrl,
        'system.datasource.username': settings.username,
        'system.datasource.password': settings.password,
        'system.datasource.type': settings.type,
        'system.datasource.hostName': settings.hostName,
        'system.datasource.port': settings.port,
        'system.datasource.name': settings.name
      };

      return {
        sectionData: {},
        deltaSettings
      };
    }
  });

  useEffect(() => {
    if (loginEnabled) {
      fetchSettings();
    }
  }, [loginEnabled, fetchSettings]);

  const handleSave = async () => {
    if (!validateLoginEnabled()) {
      return;
    }

    try {
      await saveSettings();
      showRestartModal();
    } catch (_error) {
      alert({
        alertType: 'error',
        title: t('admin.error', 'Error'),
        body: t('admin.settings.saveError', 'Failed to save settings'),
      });
    }
  };

  // Override loading state when login is disabled
  const actualLoading = loginEnabled ? loading : false;

  if (actualLoading) {
    return (
      <Stack align="center" justify="center" h={200}>
        <Loader size="lg" />
      </Stack>
    );
  }

  return (
    <Stack gap="lg">
      <LoginRequiredBanner show={!loginEnabled} />

      <div>
        <Group justify="space-between" align="center">
          <div>
            <Text fw={600} size="lg">{t('admin.settings.database.title', 'Database')}</Text>
            <Text size="sm" c="dimmed">
              {t('admin.settings.database.description', 'Configure custom database connection settings for enterprise deployments.')}
            </Text>
          </div>
          <Badge color="grape" size="lg">ENTERPRISE</Badge>
        </Group>
      </div>

      {/* Database Configuration */}
      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <Text fw={600} size="sm" mb="xs">{t('admin.settings.database.configuration', 'Database Configuration')}</Text>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text fw={500} size="sm">{t('admin.settings.database.enableCustom.label', 'Enable Custom Database')}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('admin.settings.database.enableCustom.description', 'Use your own custom database configuration instead of the default embedded database')}
              </Text>
            </div>
            <Group gap="xs">
              <Switch
                checked={settings?.enableCustomDatabase || false}
                onChange={(e) => {
                  if (!loginEnabled) return;
                  setSettings({ ...settings, enableCustomDatabase: e.target.checked });
                }}
                disabled={!loginEnabled}
                styles={getDisabledStyles()}
              />
              <PendingBadge show={isFieldPending('enableCustomDatabase')} />
            </Group>
          </div>

          {settings?.enableCustomDatabase && (
            <>
              <div>
                <TextInput
                  label={
                    <Group gap="xs">
                      <span>{t('admin.settings.database.customUrl.label', 'Custom Database URL')}</span>
                      <PendingBadge show={isFieldPending('customDatabaseUrl')} />
                    </Group>
                  }
                  description={t('admin.settings.database.customUrl.description', 'Full JDBC connection string (e.g., jdbc:postgresql://localhost:5432/postgres). If provided, individual connection settings below are not used.')}
                  value={settings?.customDatabaseUrl || ''}
                  onChange={(e) => setSettings({ ...settings, customDatabaseUrl: e.target.value })}
                  placeholder="jdbc:postgresql://localhost:5432/postgres"
                  disabled={!loginEnabled}
                />
              </div>

              <div>
                <Select
                  label={
                    <Group gap="xs">
                      <span>{t('admin.settings.database.type.label', 'Database Type')}</span>
                      <PendingBadge show={isFieldPending('type')} />
                    </Group>
                  }
                  description={t('admin.settings.database.type.description', 'Type of database (not used if custom URL is provided)')}
                  value={settings?.type || 'postgresql'}
                  onChange={(value) => setSettings({ ...settings, type: value || 'postgresql' })}
                  data={[
                    { value: 'postgresql', label: 'PostgreSQL' },
                    { value: 'h2', label: 'H2' },
                    { value: 'mysql', label: 'MySQL' },
                    { value: 'mariadb', label: 'MariaDB' }
                  ]}
                  disabled={!loginEnabled}
                />
              </div>

              <div>
                <TextInput
                  label={
                    <Group gap="xs">
                      <span>{t('admin.settings.database.hostName.label', 'Host Name')}</span>
                      <PendingBadge show={isFieldPending('hostName')} />
                    </Group>
                  }
                  description={t('admin.settings.database.hostName.description', 'Database server hostname (not used if custom URL is provided)')}
                  value={settings?.hostName || ''}
                  onChange={(e) => setSettings({ ...settings, hostName: e.target.value })}
                  placeholder="localhost"
                  disabled={!loginEnabled}
                />
              </div>

              <div>
                <NumberInput
                  label={
                    <Group gap="xs">
                      <span>{t('admin.settings.database.port.label', 'Port')}</span>
                      <PendingBadge show={isFieldPending('port')} />
                    </Group>
                  }
                  description={t('admin.settings.database.port.description', 'Database server port (not used if custom URL is provided)')}
                  value={settings?.port || 5432}
                  onChange={(value) => setSettings({ ...settings, port: Number(value) })}
                  min={1}
                  max={65535}
                  disabled={!loginEnabled}
                />
              </div>

              <div>
                <TextInput
                  label={
                    <Group gap="xs">
                      <span>{t('admin.settings.database.name.label', 'Database Name')}</span>
                      <PendingBadge show={isFieldPending('name')} />
                    </Group>
                  }
                  description={t('admin.settings.database.name.description', 'Name of the database (not used if custom URL is provided)')}
                  value={settings?.name || ''}
                  onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                  placeholder="postgres"
                  disabled={!loginEnabled}
                />
              </div>

              <div>
                <TextInput
                  label={
                    <Group gap="xs">
                      <span>{t('admin.settings.database.username.label', 'Username')}</span>
                      <PendingBadge show={isFieldPending('username')} />
                    </Group>
                  }
                  description={t('admin.settings.database.username.description', 'Database authentication username')}
                  value={settings?.username || ''}
                  onChange={(e) => setSettings({ ...settings, username: e.target.value })}
                  placeholder="postgres"
                  disabled={!loginEnabled}
                />
              </div>

              <div>
                <PasswordInput
                  label={
                    <Group gap="xs">
                      <span>{t('admin.settings.database.password.label', 'Password')}</span>
                      <PendingBadge show={isFieldPending('password')} />
                    </Group>
                  }
                  description={t('admin.settings.database.password.description', 'Database authentication password')}
                  value={settings?.password || ''}
                  onChange={(e) => setSettings({ ...settings, password: e.target.value })}
                  placeholder="••••••••"
                  disabled={!loginEnabled}
                />
              </div>
            </>
          )}
        </Stack>
      </Paper>

      {/* Save Button */}
      <Group justify="flex-end">
        <Button onClick={handleSave} loading={saving} size="sm" disabled={!loginEnabled}>
          {t('admin.settings.save', 'Save Changes')}
        </Button>
      </Group>

      {/* Restart Confirmation Modal */}
      <RestartConfirmationModal
        opened={restartModalOpened}
        onClose={closeRestartModal}
        onRestart={restartServer}
      />
    </Stack>
  );
}
