import { Modal, Stack, Button, Text, Title, Paper, List } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { Z_ANALYTICS_MODAL } from '../../styles/zIndex';
import apiClient from '../../services/apiClient';

interface AdminAnalyticsChoiceModalProps {
  opened: boolean;
  onClose?: () => void;
}

export default function AdminAnalyticsChoiceModal({ opened }: AdminAnalyticsChoiceModalProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChoice = async (enableAnalytics: boolean) => {
    setLoading(true);
    setError(null);

    try {
     const formData = new FormData();
      formData.append('enabled', enableAnalytics.toString());

      await apiClient.post('/api/v1/settings/update-enable-analytics', formData);


      // Reload the page to apply new settings
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      setLoading(false);
    }
  };

  const handleEnable = () => {
    handleChoice(true);
  };

  const handleDisable = () => {
    handleChoice(false);
  };

  return (
    <Modal
      opened={opened}
      onClose={() => {}} // Prevent closing
      closeOnClickOutside={false}
      closeOnEscape={false}
      withCloseButton={false}
      size="lg"
      centered
      zIndex={Z_ANALYTICS_MODAL}
    >
      <Stack gap="md">
        <Title order={2}>{t('analytics.modal.title', 'Configure Analytics')}</Title>

        <Text size="sm" c="dimmed">
          {t('analytics.modal.description', 'Choose whether to enable analytics for Stirling PDF. If enabled, users can control individual services (PostHog and Scarf) through the cookie preferences.')}
        </Text>

        <Paper p="md" withBorder>
          <Stack gap="xs">
            <Text fw={600} size="sm">
              {t('analytics.modal.whatWeCollect', 'What we collect:')}
            </Text>
            <List size="sm" spacing="xs">
              <List.Item>{t('analytics.modal.collect.system', 'Operating system and Java version')}</List.Item>
              <List.Item>{t('analytics.modal.collect.config', 'CPU/memory configuration and deployment type')}</List.Item>
              <List.Item>{t('analytics.modal.collect.features', 'Aggregate feature usage counts')}</List.Item>
              <List.Item>{t('analytics.modal.collect.pages', 'Page visits (via tracking pixel)')}</List.Item>
            </List>
          </Stack>
        </Paper>

        <Paper p="md" withBorder>
          <Stack gap="xs">
            <Text fw={600} size="sm">
              {t('analytics.modal.whatWeDoNotCollect', 'What we do NOT collect:')}
            </Text>
            <List size="sm" spacing="xs">
              <List.Item>{t('analytics.modal.notCollect.documents', 'Document content or file data')}</List.Item>
              <List.Item>{t('analytics.modal.notCollect.pii', 'Personally identifiable information (PII)')}</List.Item>
              <List.Item>{t('analytics.modal.notCollect.ip', 'IP addresses')}</List.Item>
            </List>
          </Stack>
        </Paper>

        <Text size="sm" fs="italic">
          {t('analytics.modal.privacy', 'All analytics data is hosted on EU servers and respects your privacy.')}
        </Text>

        {error && (
          <Text c="red" size="sm">
            {error}
          </Text>
        )}

        <Stack gap="sm">
          <Button
            onClick={handleEnable}
            loading={loading}
            fullWidth
            size="md"
          >
            {t('analytics.modal.enable', 'Enable Analytics')}
          </Button>

          <Button
            onClick={handleDisable}
            loading={loading}
            fullWidth
            size="md"
            variant="subtle"
            c="gray"
          >
            {t('analytics.modal.disable', 'Disable Analytics')}
          </Button>
        </Stack>

        <Text size="xs" c="dimmed" ta="center">
          {t('analytics.modal.note', 'This choice can be changed later by editing the settings.yml file.')}
        </Text>
      </Stack>
    </Modal>
  );
}
