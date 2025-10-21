import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { NumberInput, Switch, Button, Stack, Paper, Text, Loader, Group, TextInput, PasswordInput, Select, Badge } from '@mantine/core';
import { alert } from '../../../toast';
import RestartConfirmationModal from '../RestartConfirmationModal';
import { useRestartServer } from '../useRestartServer';

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<DatabaseSettingsData>({});
  const { restartModalOpened, showRestartModal, closeRestartModal, restartServer } = useRestartServer();

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/v1/admin/settings/section/system');
      const systemData = response.ok ? await response.json() : {};

      setSettings(systemData.datasource || {
        enableCustomDatabase: false,
        customDatabaseUrl: '',
        username: '',
        password: '',
        type: 'postgresql',
        hostName: 'localhost',
        port: 5432,
        name: 'postgres'
      });
    } catch (error) {
      console.error('Failed to fetch database settings:', error);
      alert({
        alertType: 'error',
        title: t('admin.error', 'Error'),
        body: t('admin.settings.fetchError', 'Failed to load settings'),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
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

      const response = await fetch('/api/v1/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: deltaSettings }),
      });

      if (response.ok) {
        showRestartModal();
      } else {
        throw new Error('Failed to save');
      }
    } catch (error) {
      alert({
        alertType: 'error',
        title: t('admin.error', 'Error'),
        body: t('admin.settings.saveError', 'Failed to save settings'),
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Stack align="center" justify="center" h={200}>
        <Loader size="lg" />
      </Stack>
    );
  }

  return (
    <Stack gap="lg">
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
              <Text fw={500} size="sm">{t('admin.settings.database.enableCustom', 'Enable Custom Database')}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('admin.settings.database.enableCustom.description', 'Use your own custom database configuration instead of the default embedded database')}
              </Text>
            </div>
            <Switch
              checked={settings.enableCustomDatabase || false}
              onChange={(e) => setSettings({ ...settings, enableCustomDatabase: e.target.checked })}
            />
          </div>

          {settings.enableCustomDatabase && (
            <>
              <div>
                <TextInput
                  label={t('admin.settings.database.customUrl', 'Custom Database URL')}
                  description={t('admin.settings.database.customUrl.description', 'Full JDBC connection string (e.g., jdbc:postgresql://localhost:5432/postgres). If provided, individual connection settings below are not used.')}
                  value={settings.customDatabaseUrl || ''}
                  onChange={(e) => setSettings({ ...settings, customDatabaseUrl: e.target.value })}
                  placeholder="jdbc:postgresql://localhost:5432/postgres"
                />
              </div>

              <div>
                <Select
                  label={t('admin.settings.database.type', 'Database Type')}
                  description={t('admin.settings.database.type.description', 'Type of database (not used if custom URL is provided)')}
                  value={settings.type || 'postgresql'}
                  onChange={(value) => setSettings({ ...settings, type: value || 'postgresql' })}
                  data={[
                    { value: 'postgresql', label: 'PostgreSQL' },
                    { value: 'h2', label: 'H2' },
                    { value: 'mysql', label: 'MySQL' },
                    { value: 'mariadb', label: 'MariaDB' }
                  ]}
                />
              </div>

              <div>
                <TextInput
                  label={t('admin.settings.database.hostName', 'Host Name')}
                  description={t('admin.settings.database.hostName.description', 'Database server hostname (not used if custom URL is provided)')}
                  value={settings.hostName || ''}
                  onChange={(e) => setSettings({ ...settings, hostName: e.target.value })}
                  placeholder="localhost"
                />
              </div>

              <div>
                <NumberInput
                  label={t('admin.settings.database.port', 'Port')}
                  description={t('admin.settings.database.port.description', 'Database server port (not used if custom URL is provided)')}
                  value={settings.port || 5432}
                  onChange={(value) => setSettings({ ...settings, port: Number(value) })}
                  min={1}
                  max={65535}
                />
              </div>

              <div>
                <TextInput
                  label={t('admin.settings.database.name', 'Database Name')}
                  description={t('admin.settings.database.name.description', 'Name of the database (not used if custom URL is provided)')}
                  value={settings.name || ''}
                  onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                  placeholder="postgres"
                />
              </div>

              <div>
                <TextInput
                  label={t('admin.settings.database.username', 'Username')}
                  description={t('admin.settings.database.username.description', 'Database authentication username')}
                  value={settings.username || ''}
                  onChange={(e) => setSettings({ ...settings, username: e.target.value })}
                  placeholder="postgres"
                />
              </div>

              <div>
                <PasswordInput
                  label={t('admin.settings.database.password', 'Password')}
                  description={t('admin.settings.database.password.description', 'Database authentication password')}
                  value={settings.password || ''}
                  onChange={(e) => setSettings({ ...settings, password: e.target.value })}
                  placeholder="••••••••"
                />
              </div>
            </>
          )}
        </Stack>
      </Paper>

      {/* Save Button */}
      <Group justify="flex-end">
        <Button onClick={handleSave} loading={saving} size="sm">
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
