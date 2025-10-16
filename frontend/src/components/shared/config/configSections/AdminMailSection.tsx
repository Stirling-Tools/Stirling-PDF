import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { TextInput, NumberInput, Switch, Button, Stack, Paper, Text, Loader, Group, PasswordInput } from '@mantine/core';
import { alert } from '../../../toast';
import RestartConfirmationModal from '../RestartConfirmationModal';
import { useRestartServer } from '../useRestartServer';

interface MailSettingsData {
  enabled?: boolean;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  from?: string;
}

export default function AdminMailSection() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<MailSettingsData>({});
  const { restartModalOpened, showRestartModal, closeRestartModal, restartServer } = useRestartServer();

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/v1/admin/settings/section/mail');
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      }
    } catch (error) {
      console.error('Failed to fetch mail settings:', error);
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
      const response = await fetch('/api/v1/admin/settings/section/mail', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
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
        <Text fw={600} size="lg">{t('admin.settings.mail.title', 'Mail Configuration')}</Text>
        <Text size="sm" c="dimmed">
          {t('admin.settings.mail.description', 'Configure SMTP settings for email notifications.')}
        </Text>
      </div>

      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text fw={500} size="sm">{t('admin.settings.mail.enabled', 'Enable Mail')}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('admin.settings.mail.enabled.description', 'Enable email notifications and SMTP functionality')}
              </Text>
            </div>
            <Switch
              checked={settings.enabled || false}
              onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
            />
          </div>

          <div>
            <TextInput
              label={t('admin.settings.mail.host', 'SMTP Host')}
              description={t('admin.settings.mail.host.description', 'SMTP server hostname')}
              value={settings.host || ''}
              onChange={(e) => setSettings({ ...settings, host: e.target.value })}
              placeholder="smtp.example.com"
            />
          </div>

          <div>
            <NumberInput
              label={t('admin.settings.mail.port', 'SMTP Port')}
              description={t('admin.settings.mail.port.description', 'SMTP server port (typically 587 for TLS, 465 for SSL)')}
              value={settings.port || 587}
              onChange={(value) => setSettings({ ...settings, port: Number(value) })}
              min={1}
              max={65535}
            />
          </div>

          <div>
            <TextInput
              label={t('admin.settings.mail.username', 'SMTP Username')}
              description={t('admin.settings.mail.username.description', 'SMTP authentication username')}
              value={settings.username || ''}
              onChange={(e) => setSettings({ ...settings, username: e.target.value })}
            />
          </div>

          <div>
            <PasswordInput
              label={t('admin.settings.mail.password', 'SMTP Password')}
              description={t('admin.settings.mail.password.description', 'SMTP authentication password')}
              value={settings.password || ''}
              onChange={(e) => setSettings({ ...settings, password: e.target.value })}
            />
          </div>

          <div>
            <TextInput
              label={t('admin.settings.mail.from', 'From Address')}
              description={t('admin.settings.mail.from.description', 'Email address to use as sender')}
              value={settings.from || ''}
              onChange={(e) => setSettings({ ...settings, from: e.target.value })}
              placeholder="noreply@example.com"
            />
          </div>
        </Stack>
      </Paper>

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
