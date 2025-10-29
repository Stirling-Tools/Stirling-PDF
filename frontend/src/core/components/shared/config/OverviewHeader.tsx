import { Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';

export function OverviewHeader() {
  const { t } = useTranslation();

  return (
    <div>
      <Text fw={600} size="lg">{t('config.overview.title', 'Application Configuration')}</Text>
      <Text size="sm" c="dimmed">
        {t('config.overview.description', 'Current application settings and configuration details.')}
      </Text>
    </div>
  );
}
