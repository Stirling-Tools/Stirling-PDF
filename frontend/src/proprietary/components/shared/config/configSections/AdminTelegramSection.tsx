import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Group,
  Loader,
  NumberInput,
  Paper,
  PasswordInput,
  Stack,
  Switch,
  TagsInput,
  Text,
  TextInput
} from '@mantine/core';
import { alert } from '@app/components/toast';
import PendingBadge from '@app/components/shared/config/PendingBadge';
import RestartConfirmationModal from '@app/components/shared/config/RestartConfirmationModal';
import { useRestartServer } from '@app/components/shared/config/useRestartServer';
import { useAdminSettings } from '@app/hooks/useAdminSettings';

interface FeedbackFlags {
  noValidDocument?: boolean;
  processingError?: boolean;
  errorMessage?: boolean;
}

interface FeedbackSettings {
  general?: { enabled?: boolean };
  channel?: FeedbackFlags;
  user?: FeedbackFlags;
}

interface TelegramSettingsData {
  enabled?: boolean;
  botToken?: string;
  botUsername?: string;
  pipelineInboxFolder?: string;
  customFolderSuffix?: boolean;
  enableAllowUserIDs?: boolean;
  allowUserIDs?: number[];
  enableAllowChannelIDs?: boolean;
  allowChannelIDs?: number[];
  processingTimeoutSeconds?: number;
  pollingIntervalMillis?: number;
  feedback?: FeedbackSettings;
}

const DEFAULT_FEEDBACK: FeedbackSettings = {
  general: { enabled: true },
  channel: {
    noValidDocument: false,
    processingError: false,
    errorMessage: false
  },
  user: {
    noValidDocument: false,
    processingError: false,
    errorMessage: false
  }
};

export default function AdminTelegramSection() {
  const { t } = useTranslation();
  const { restartModalOpened, showRestartModal, closeRestartModal, restartServer } = useRestartServer();

  const { settings, setSettings, loading, saving, fetchSettings, saveSettings, isFieldPending } =
    useAdminSettings<TelegramSettingsData>({ sectionName: 'telegram' });

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const feedbackSettings = useMemo(
    () => ({ ...DEFAULT_FEEDBACK, ...settings.feedback }),
    [settings.feedback]
  );

  const handleSave = async () => {
    try {
      await saveSettings();
      showRestartModal();
    } catch (_error) {
      alert({
        alertType: 'error',
        title: t('admin.error', 'Error'),
        body: t('admin.settings.saveError', 'Failed to save settings')
      });
    }
  };

  const handleIdsChange = (field: 'allowUserIDs' | 'allowChannelIDs', values: string[]) => {
    const parsed = values
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
      .map((value) => Number(value))
      .filter((value) => !Number.isNaN(value));

    setSettings({
      ...settings,
      [field]: parsed
    });
  };

  const handleFeedbackChange = (scope: 'channel' | 'user' | 'general', key: string, value: boolean) => {
    if (scope === 'general') {
      const generalSettings = feedbackSettings.general ?? { enabled: true };
      setSettings({
        ...settings,
        feedback: {
          ...feedbackSettings,
          general: {
            ...generalSettings,
            [key]: value
          }
        }
      });
      return;
    }

    const scopeSettings = (feedbackSettings[scope] as FeedbackFlags | undefined) ?? {};
    setSettings({
      ...settings,
      feedback: {
        ...feedbackSettings,
        [scope]: {
          ...scopeSettings,
          [key]: value
        }
      }
    });
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
        <Text fw={600} size="lg">
          {t('admin.settings.telegram.title', 'Telegram Bot')}
        </Text>
        <Text size="sm" c="dimmed">
          {t(
            'admin.settings.telegram.description',
            'Configure Telegram bot connectivity, access controls, and feedback behavior.'
          )}
        </Text>
      </div>

      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <div>
              <Text fw={500} size="sm">
                {t('admin.settings.telegram.enabled.label', 'Enable Telegram Bot')}
              </Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t(
                  'admin.settings.telegram.enabled.description',
                  'Allow users to interact with Stirling PDF through your configured Telegram bot.'
                )}
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

          <TextInput
            label={
              <Group gap="xs">
                <span>{t('admin.settings.telegram.botUsername.label', 'Bot Username')}</span>
                <PendingBadge show={isFieldPending('botUsername')} />
              </Group>
            }
            description={t(
              'admin.settings.telegram.botUsername.description',
              'The public username of your Telegram bot.'
            )}
            placeholder="my_pdf_bot"
            value={settings.botUsername || ''}
            onChange={(e) => setSettings({ ...settings, botUsername: e.target.value })}
            disabled={!settings.enabled}
          />

          <PasswordInput
            label={
              <Group gap="xs">
                <span>{t('admin.settings.telegram.botToken.label', 'Bot Token')}</span>
                <PendingBadge show={isFieldPending('botToken')} />
              </Group>
            }
            description={t(
              'admin.settings.telegram.botToken.description',
              'API token provided by BotFather for your Telegram bot.'
            )}
            placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
            value={settings.botToken || ''}
            onChange={(e) => setSettings({ ...settings, botToken: e.target.value })}
            disabled={!settings.enabled}
          />

          <TextInput
            label={
              <Group gap="xs">
                <span>{t('admin.settings.telegram.pipelineInboxFolder.label', 'Inbox Folder')}</span>
                <PendingBadge show={isFieldPending('pipelineInboxFolder')} />
              </Group>
            }
            description={t(
              'admin.settings.telegram.pipelineInboxFolder.description',
              'Folder under the pipeline directory where incoming Telegram files are stored.'
            )}
            placeholder="telegram"
            value={settings.pipelineInboxFolder || ''}
            onChange={(e) => setSettings({ ...settings, pipelineInboxFolder: e.target.value })}
            disabled={!settings.enabled}
          />

          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <div>
              <Text fw={500} size="sm">
                {t('admin.settings.telegram.customFolderSuffix.label', 'Use Custom Folder Suffix')}
              </Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t(
                  'admin.settings.telegram.customFolderSuffix.description',
                  'Append the chat ID to incoming file folders to isolate uploads per chat.'
                )}
              </Text>
            </div>
          </Group>
        </Stack>
      </Paper>

      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <div>
            <Text fw={600} size="sm">
              {t('admin.settings.telegram.accessControl.title', 'Access Control')}
            </Text>
            <Text size="xs" c="dimmed">
              {t(
                'admin.settings.telegram.accessControl.description',
                'Restrict which users or channels can interact with the bot.'
              )}
            </Text>
          </div>

          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <div>
              <Text fw={500} size="sm">
                {t('admin.settings.telegram.enableAllowUserIDs.label', 'Allow Specific User IDs')}
              </Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t(
                  'admin.settings.telegram.enableAllowUserIDs.description',
                  'When enabled, only listed user IDs can use the bot.'
                )}
              </Text>
            </div>
            <Group gap="xs">
              <Switch
                checked={settings.enableAllowUserIDs || false}
                onChange={(e) => setSettings({ ...settings, enableAllowUserIDs: e.target.checked })}
                disabled={!settings.enabled}
              />
              <PendingBadge show={isFieldPending('enableAllowUserIDs')} />
            </Group>
          </Group>

          <TagsInput
            label={
              <Group gap="xs">
                <span>{t('admin.settings.telegram.allowUserIDs.label', 'Allowed User IDs')}</span>
                <PendingBadge show={isFieldPending('allowUserIDs')} />
              </Group>
            }
            description={t(
              'admin.settings.telegram.allowUserIDs.description',
              'Enter Telegram user IDs allowed to interact with the bot.'
            )}
            placeholder={t('admin.settings.telegram.allowUserIDs.placeholder', 'Add user ID and press enter')}
            value={(settings.allowUserIDs || []).map((value) => value.toString())}
            onChange={(values) => handleIdsChange('allowUserIDs', values)}
            disabled={!settings.enabled || !settings.enableAllowUserIDs}
          />

          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <div>
              <Text fw={500} size="sm">
                {t('admin.settings.telegram.enableAllowChannelIDs.label', 'Allow Specific Channel IDs')}
              </Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t(
                  'admin.settings.telegram.enableAllowChannelIDs.description',
                  'When enabled, only listed channel IDs can use the bot.'
                )}
              </Text>
            </div>
            <Group gap="xs">
              <Switch
                checked={settings.enableAllowChannelIDs || false}
                onChange={(e) =>
                  setSettings({ ...settings, enableAllowChannelIDs: e.target.checked })
                }
                disabled={!settings.enabled}
              />
              <PendingBadge show={isFieldPending('enableAllowChannelIDs')} />
            </Group>
          </Group>

          <TagsInput
            label={
              <Group gap="xs">
                <span>{t('admin.settings.telegram.allowChannelIDs.label', 'Allowed Channel IDs')}</span>
                <PendingBadge show={isFieldPending('allowChannelIDs')} />
              </Group>
            }
            description={t(
              'admin.settings.telegram.allowChannelIDs.description',
              'Enter Telegram channel IDs allowed to interact with the bot.'
            )}
            placeholder={t('admin.settings.telegram.allowChannelIDs.placeholder', 'Add channel ID and press enter')}
            value={(settings.allowChannelIDs || []).map((value) => value.toString())}
            onChange={(values) => handleIdsChange('allowChannelIDs', values)}
            disabled={!settings.enabled || !settings.enableAllowChannelIDs}
          />
        </Stack>
      </Paper>

      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <div>
            <Text fw={600} size="sm">
              {t('admin.settings.telegram.processing.title', 'Processing')}
            </Text>
            <Text size="xs" c="dimmed">
              {t(
                'admin.settings.telegram.processing.description',
                'Control polling intervals and processing timeouts for Telegram uploads.'
              )}
            </Text>
          </div>

          <NumberInput
            label={
              <Group gap="xs">
                <span>{t('admin.settings.telegram.processingTimeoutSeconds.label', 'Processing Timeout (seconds)')}</span>
                <PendingBadge show={isFieldPending('processingTimeoutSeconds')} />
              </Group>
            }
            description={t(
              'admin.settings.telegram.processingTimeoutSeconds.description',
              'Maximum time to wait for a processing job before reporting an error.'
            )}
            min={10}
            value={settings.processingTimeoutSeconds ?? 180}
            onChange={(value) =>
              setSettings({ ...settings, processingTimeoutSeconds: Number(value) || 0 })
            }
            disabled={!settings.enabled}
          />

          <NumberInput
            label={
              <Group gap="xs">
                <span>{t('admin.settings.telegram.pollingIntervalMillis.label', 'Polling Interval (ms)')}</span>
                <PendingBadge show={isFieldPending('pollingIntervalMillis')} />
              </Group>
            }
            description={t(
              'admin.settings.telegram.pollingIntervalMillis.description',
              'Interval between checks for new Telegram updates.'
            )}
            min={500}
            value={settings.pollingIntervalMillis ?? 2000}
            onChange={(value) =>
              setSettings({ ...settings, pollingIntervalMillis: Number(value) || 0 })
            }
            disabled={!settings.enabled}
          />
        </Stack>
      </Paper>

      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <div>
            <Text fw={600} size="sm">
              {t('admin.settings.telegram.feedback.title', 'Feedback Messages')}
            </Text>
            <Text size="xs" c="dimmed">
              {t(
                'admin.settings.telegram.feedback.description',
                'Choose when the bot should send feedback to users and channels.'
              )}
            </Text>
          </div>

          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <div>
              <Text fw={500} size="sm">
                {t('admin.settings.telegram.feedback.general.enabled.label', 'Enable Feedback')}
              </Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t(
                  'admin.settings.telegram.feedback.general.enabled.description',
                  'Control whether the bot sends feedback messages at all.'
                )}
              </Text>
            </div>
            <Group gap="xs">
              <Switch
                checked={feedbackSettings.general?.enabled ?? true}
                onChange={(e) => handleFeedbackChange('general', 'enabled', e.target.checked)}
                disabled={!settings.enabled}
              />
              <PendingBadge show={isFieldPending('feedback.general.enabled')} />
            </Group>
          </Group>

          <Text fw={500} size="sm">
            {t('admin.settings.telegram.feedback.channel.title', 'Channel Feedback Rules')}
          </Text>
          <Group gap="md" wrap="wrap">
            <Switch
              label={t('admin.settings.telegram.feedback.noValidDocument', 'Hide "No valid document"')}
              checked={feedbackSettings.channel?.noValidDocument ?? false}
              onChange={(e) => handleFeedbackChange('channel', 'noValidDocument', e.target.checked)}
              disabled={!settings.enabled}
            />
            <Switch
              label={t('admin.settings.telegram.feedback.processingError', 'Hide processing errors')}
              checked={feedbackSettings.channel?.processingError ?? false}
              onChange={(e) => handleFeedbackChange('channel', 'processingError', e.target.checked)}
              disabled={!settings.enabled}
            />
            <Switch
              label={t('admin.settings.telegram.feedback.errorMessage', 'Hide error messages')}
              checked={feedbackSettings.channel?.errorMessage ?? false}
              onChange={(e) => handleFeedbackChange('channel', 'errorMessage', e.target.checked)}
              disabled={!settings.enabled}
            />
          </Group>
          <PendingBadge show={isFieldPending('feedback.channel')} />

          <Text fw={500} size="sm">
            {t('admin.settings.telegram.feedback.user.title', 'User Feedback Rules')}
          </Text>
          <Group gap="md" wrap="wrap">
            <Switch
              label={t('admin.settings.telegram.feedback.noValidDocument', 'Hide "No valid document"')}
              checked={feedbackSettings.user?.noValidDocument ?? false}
              onChange={(e) => handleFeedbackChange('user', 'noValidDocument', e.target.checked)}
              disabled={!settings.enabled}
            />
            <Switch
              label={t('admin.settings.telegram.feedback.processingError', 'Hide processing errors')}
              checked={feedbackSettings.user?.processingError ?? false}
              onChange={(e) => handleFeedbackChange('user', 'processingError', e.target.checked)}
              disabled={!settings.enabled}
            />
            <Switch
              label={t('admin.settings.telegram.feedback.errorMessage', 'Hide error messages')}
              checked={feedbackSettings.user?.errorMessage ?? false}
              onChange={(e) => handleFeedbackChange('user', 'errorMessage', e.target.checked)}
              disabled={!settings.enabled}
            />
          </Group>
          <PendingBadge show={isFieldPending('feedback.user')} />
        </Stack>
      </Paper>

      <Group justify="flex-end">
        <Button onClick={handleSave} loading={saving} disabled={!settings.enabled && !saving}>
          {t('admin.settings.save', 'Save Changes')}
        </Button>
      </Group>

      <RestartConfirmationModal
        opened={restartModalOpened}
        onClose={closeRestartModal}
        onRestart={restartServer}
      />
    </Stack>
  );
}
