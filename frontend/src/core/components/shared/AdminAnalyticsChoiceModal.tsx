import {
  Modal,
  Stack,
  Button,
  Text,
  Title,
  Anchor,
  useMantineTheme,
  useComputedColorScheme,
} from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { Z_ANALYTICS_MODAL } from '@app/styles/zIndex';
import { useAppConfig } from '@app/contexts/AppConfigContext';
import apiClient from '@app/services/apiClient';

interface AdminAnalyticsChoiceModalProps {
  opened: boolean;
  onClose: () => void;
}

export default function AdminAnalyticsChoiceModal({ opened, onClose }: AdminAnalyticsChoiceModalProps) {
  const { t } = useTranslation();
  const { refetch } = useAppConfig();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const theme = useMantineTheme();
  const computedColorScheme = useComputedColorScheme('light', { getInitialValueInEffect: true });
  const isDark = computedColorScheme === 'dark';
  const privacyHighlightStyles = {
    color: isDark ? '#FFFFFF' : theme.colors.blue[7],
    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
    borderRadius: theme.radius.md,
    fontWeight: 700,
    textAlign: 'center' as const,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    letterSpacing: 0.3,
  };

  const handleChoice = async (enableAnalytics: boolean) => {
    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('enabled', enableAnalytics.toString());

      await apiClient.post('/api/v1/settings/update-enable-analytics', formData);

      // Refetch config to apply new settings without page reload
      await refetch();

      // Close the modal after successful save
      onClose();
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
        <Title order={2}>{t('analytics.title', 'Do you want make Stirling PDF better?')}</Title>

        <Text size="sm" c="dimmed">
          {t('analytics.paragraph1', 'Stirling PDF has opt in analytics to help us improve the product.')}
        </Text>
        <Text size="sm" style={privacyHighlightStyles}>
          • {t('analytics.privacyAssurance', 'We do not track any personal information or the contents of your files.')} •
        </Text>

        <Text size="sm" c="dimmed">
          {t('analytics.paragraph2', 'Please consider enabling analytics to help Stirling-PDF grow and to allow us to understand our users better.')}{' '}
          <Anchor
            href="https://docs.stirlingpdf.com/analytics-telemetry"
            target="_blank"
            rel="noopener noreferrer"
            size="sm"
          >
            {t('analytics.learnMore', 'Learn more')}
          </Anchor>
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
            {t('analytics.enable', 'Enable analytics')}
          </Button>

          <Button
            onClick={handleDisable}
            loading={loading}
            fullWidth
            size="md"
            variant="subtle"
            c="gray"
          >
            {t('analytics.disable', 'Disable analytics')}
          </Button>
        </Stack>

        <Text size="xs" c="dimmed" ta="center">
          {t('analytics.settings', 'You can change the settings for analytics in the config/settings.yml file')}
        </Text>
      </Stack>
    </Modal>
  );
}
