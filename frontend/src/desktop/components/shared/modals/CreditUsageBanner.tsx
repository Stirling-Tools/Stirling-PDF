import { Divider, Group, Text, Progress, Stack } from '@mantine/core';
import { useTranslation } from 'react-i18next';

interface CreditUsageBannerProps {
  currentCredits: number;
  totalCredits: number;
}

/**
 * Credit usage banner showing remaining credits with progress bar
 * Used in credit exhausted and upgrade modals
 */
export function CreditUsageBanner({ currentCredits, totalCredits }: CreditUsageBannerProps) {
  const { t } = useTranslation();
  const percentageRemaining = totalCredits > 0 ? (currentCredits / totalCredits) * 100 : 0;

  return (
    <Stack gap="md">
      <Divider />
      <Stack gap="xs" pr="md" pl="md">
        <Group gap="xs" justify="space-between" align="center">
          <Text size="md" fw={400} c="dimmed">
            {t('credits.modal.creditsThisMonth', 'Monthly credits')}
          </Text>
          <Text size="md" fw={600} style={{ color: 'var(--text-primary)' }}>
            {t('credits.modal.creditsRemaining', '{{current}} of {{total}} remaining', {
              current: currentCredits,
              total: totalCredits,
            })}
          </Text>
        </Group>
        <Progress
          value={percentageRemaining}
          size="sm"
          radius="xl"
          color="blue"
          styles={{
            root: { backgroundColor: 'var(--bg-raised)' },
          }}
        />
      </Stack>
      <Divider />
    </Stack>
  );
}
