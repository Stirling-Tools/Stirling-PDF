import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { TextInput, NumberInput, Switch, Button, Stack, Paper, Text, Loader, Group, PasswordInput, Anchor } from '@mantine/core';
import { alert } from '@app/components/toast';
import RestartConfirmationModal from '@app/components/shared/config/RestartConfirmationModal';
import { useRestartServer } from '@app/components/shared/config/useRestartServer';
import { useAdminSettings } from '@app/hooks/useAdminSettings';
import PendingBadge from '@app/components/shared/config/PendingBadge';
import apiClient from '@app/services/apiClient';

interface MailSettingsData {
  enabled?: boolean;
  enableInvites?: boolean;
  inviteLinkExpiryHours?: number;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  from?: string;
}

interface ApiResponseWithPending<T> {
  _pending?: Partial<T>;
}

type MailApiResponse = MailSettingsData & ApiResponseWithPending<MailSettingsData>;

export default function AdminMailSection() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { restartModalOpened, showRestartModal, closeRestartModal, restartServer } = useRestartServer();

  const {
    settings,
    setSettings,
    loading,
    saving,
    fetchSettings,
    saveSettings,
    isFieldPending,
  } = useAdminSettings<MailSettingsData>({
    sectionName: 'mail',
    fetchTransformer: async () => {
      const mailResponse = await apiClient.get<MailApiResponse>('/api/v1/admin/settings/section/mail');
      return mailResponse.data || {};
    },
    saveTransformer: (settings) => {
      return {
        sectionData: settings,
        deltaSettings: {}
      };
    }
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async () => {
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
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <div>
              <Text fw={500} size="sm">{t('admin.settings.mail.enabled.label', 'Enable Mail')}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('admin.settings.mail.enabled.description', 'Enable email notifications and SMTP functionality')}
              </Text>
            </div>
            <Group gap="xs">
              <Switch
                checked={settings.enabled || false}
                onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
              />
              <PendingBadge show={isFieldPending('enabled')} />
            </Group>
          </Group>

          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <div>
              <Text fw={500} size="sm">{t('admin.settings.mail.enableInvites.label', 'Enable Email Invites')}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('admin.settings.mail.enableInvites.description', 'Allow admins to invite users via email with auto-generated passwords')}
              </Text>
              <Text size="xs" c="orange" mt={8} fw={500}>
                {t('admin.settings.mail.frontendUrlNote.note', 'Note: Requires Frontend URL to be configured. ')}
                <Anchor href="#" onClick={(e) => { e.preventDefault(); navigate('/settings/adminGeneral#frontendUrl'); }} c="orange" td="underline">
                  {t('admin.settings.mail.frontendUrlNote.link', 'Configure in System Settings')}
                </Anchor>
              </Text>
            </div>
            <Group gap="xs">
              <Switch
                checked={settings.enableInvites || false}
                onChange={(e) => setSettings({ ...settings, enableInvites: e.target.checked })}
                disabled={!settings.enabled}
              />
              <PendingBadge show={isFieldPending('enableInvites')} />
            </Group>
          </Group>

          <div>
            <TextInput
              label={
                <Group gap="xs">
                  <span>{t('admin.settings.mail.host.label', 'SMTP Host')}</span>
                  <PendingBadge show={isFieldPending('host')} />
                </Group>
              }
              description={t('admin.settings.mail.host.description', 'SMTP server hostname')}
              value={settings.host || ''}
              onChange={(e) => setSettings({ ...settings, host: e.target.value })}
              placeholder="smtp.example.com"
            />
          </div>

          <div>
            <NumberInput
              label={
                <Group gap="xs">
                  <span>{t('admin.settings.mail.port.label', 'SMTP Port')}</span>
                  <PendingBadge show={isFieldPending('port')} />
                </Group>
              }
              description={t('admin.settings.mail.port.description', 'SMTP server port (typically 587 for TLS, 465 for SSL)')}
              value={settings.port || 587}
              onChange={(value) => setSettings({ ...settings, port: Number(value) })}
              min={1}
              max={65535}
            />
          </div>

          <div>
            <TextInput
              label={
                <Group gap="xs">
                  <span>{t('admin.settings.mail.username.label', 'SMTP Username')}</span>
                  <PendingBadge show={isFieldPending('username')} />
                </Group>
              }
              description={t('admin.settings.mail.username.description', 'SMTP authentication username')}
              value={settings.username || ''}
              onChange={(e) => setSettings({ ...settings, username: e.target.value })}
            />
          </div>

          <div>
            <PasswordInput
              label={
                <Group gap="xs">
                  <span>{t('admin.settings.mail.password.label', 'SMTP Password')}</span>
                  <PendingBadge show={isFieldPending('password')} />
                </Group>
              }
              description={t('admin.settings.mail.password.description', 'SMTP authentication password')}
              value={settings.password || ''}
              onChange={(e) => setSettings({ ...settings, password: e.target.value })}
            />
          </div>

          <div>
            <TextInput
              label={
                <Group gap="xs">
                  <span>{t('admin.settings.mail.from.label', 'From Address')}</span>
                  <PendingBadge show={isFieldPending('from')} />
                </Group>
              }
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
