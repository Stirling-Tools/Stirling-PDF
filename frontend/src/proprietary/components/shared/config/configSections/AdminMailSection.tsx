import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { TextInput, NumberInput, Switch, Button, Stack, Paper, Text, Loader, Group, PasswordInput } from '@mantine/core';
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
  frontendUrl?: string;
}

interface ApiResponseWithPending<T> {
  _pending?: Partial<T>;
}

type MailApiResponse = MailSettingsData & ApiResponseWithPending<MailSettingsData>;
type SystemApiResponse = { frontendUrl?: string } & ApiResponseWithPending<{ frontendUrl?: string }>;

export default function AdminMailSection() {
  const { t } = useTranslation();
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
      const [mailResponse, systemResponse] = await Promise.all([
        apiClient.get<MailApiResponse>('/api/v1/admin/settings/section/mail'),
        apiClient.get<SystemApiResponse>('/api/v1/admin/settings/section/system')
      ]);

      const mail = mailResponse.data || {};
      const system = systemResponse.data || {};

      const result: MailSettingsData & ApiResponseWithPending<MailSettingsData> = {
        ...mail,
        frontendUrl: system.frontendUrl || ''
      };

      // Merge pending blocks from both endpoints
      const pendingBlock: Partial<MailSettingsData> = {};
      if (mail._pending) {
        Object.assign(pendingBlock, mail._pending);
      }
      if (system._pending?.frontendUrl !== undefined) {
        pendingBlock.frontendUrl = system._pending.frontendUrl;
      }

      if (Object.keys(pendingBlock).length > 0) {
        result._pending = pendingBlock;
      }

      return result;
    },
    saveTransformer: (settings) => {
      const { frontendUrl, ...mailSettings } = settings;

      const deltaSettings: Record<string, any> = {
        'system.frontendUrl': frontendUrl
      };

      return {
        sectionData: mailSettings,
        deltaSettings
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

          <div>
            <TextInput
              label={
                <Group gap="xs">
                  <span>{t('admin.settings.mail.frontendUrl.label', 'Frontend URL')}</span>
                  <PendingBadge show={isFieldPending('frontendUrl')} />
                </Group>
              }
              description={t('admin.settings.mail.frontendUrl.description', 'Base URL for frontend (e.g. https://pdf.example.com). Used for generating invite links in emails. Leave empty to use backend URL.')}
              value={settings.frontendUrl || ''}
              onChange={(e) => setSettings({ ...settings, frontendUrl: e.target.value })}
              placeholder="https://pdf.example.com"
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
