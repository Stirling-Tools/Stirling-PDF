import React from 'react';
import { Card, Text, Stack, Group, Progress, Alert } from '@mantine/core';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { useTranslation } from 'react-i18next';
import type { BillingStatus } from '@app/services/saasBillingService';

interface UsageDisplayProps {
  tier: BillingStatus['tier'];
  usage: BillingStatus['meterUsage'];
}

export function UsageDisplay({ tier, usage }: UsageDisplayProps) {
  const { t } = useTranslation();

  // Credits per month based on tier
  const getMonthlyCredits = (): number => {
    switch (tier) {
      case 'free':
        return 50;
      case 'team':
        return 500;
      case 'enterprise':
        return 1000; // Placeholder
      default:
        return 50;
    }
  };

  const monthlyCredits = getMonthlyCredits();

  // Format currency
  const formatCurrency = (cents: number): string => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Stack gap="md">
        {/* Header */}
        <Text size="lg" fw={600}>
          {t('settings.planBilling.credits.title', 'Credit Usage')}
        </Text>

        {/* Monthly credits info */}
        <Group justify="space-between">
          <Text size="sm" c="dimmed">
            {t('settings.planBilling.credits.included', {
              count: monthlyCredits,
              defaultValue: `${monthlyCredits} credits/month (included)`,
            })}
          </Text>
        </Group>

        {/* Overage credits (if metered billing enabled) */}
        {usage && usage.currentPeriodCredits > 0 && (
          <>
            <Stack gap="xs">
              <Group justify="space-between">
                <Text size="sm" c="dimmed">
                  {t('settings.planBilling.credits.overage', {
                    count: usage.currentPeriodCredits,
                    defaultValue: `+ ${usage.currentPeriodCredits} overage`,
                  })}
                </Text>
                <Text size="sm" fw={500} c="orange">
                  {t('settings.planBilling.credits.estimatedCost', {
                    amount: formatCurrency(usage.estimatedCost),
                    defaultValue: `Estimated cost: ${formatCurrency(usage.estimatedCost)}`,
                  })}
                </Text>
              </Group>

              {/* Progress bar for overage usage */}
              <Progress
                value={100}
                color="orange"
                size="sm"
                radius="xl"
                striped
                animated
              />
            </Stack>

            <Alert color="blue" variant="light" icon={<InfoOutlinedIcon sx={{ fontSize: 16 }} />}>
              <Text size="xs">
                Overage credits are billed at $0.05 per credit. You'll only pay for what you use beyond your monthly
                allowance.
              </Text>
            </Alert>
          </>
        )}

        {/* No overage message */}
        {(!usage || usage.currentPeriodCredits === 0) && tier !== 'free' && (
          <Alert color="green" variant="light">
            <Text size="sm">
              No overage charges this month. You're using your included {monthlyCredits} credits.
            </Text>
          </Alert>
        )}

        {/* Free tier message */}
        {tier === 'free' && (
          <Alert color="blue" variant="light">
            <Text size="sm">
              Free plan includes {monthlyCredits} credits per month. Upgrade to Team for 500 credits/month and pay-as-you-go
              overage billing.
            </Text>
          </Alert>
        )}
      </Stack>
    </Card>
  );
}
