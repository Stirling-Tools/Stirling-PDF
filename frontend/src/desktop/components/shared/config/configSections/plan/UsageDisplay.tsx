import React from 'react';
import { Card, Text, Stack, Group, Progress, Alert } from '@mantine/core';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { useTranslation } from 'react-i18next';
import type { BillingStatus } from '@app/services/saasBillingService';
import { BILLING_CONFIG, getFormattedOveragePrice } from '@app/config/billing';

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
        return BILLING_CONFIG.FREE_CREDITS_PER_MONTH;
      case 'team':
        return BILLING_CONFIG.INCLUDED_CREDITS_PER_MONTH;
      case 'enterprise':
        return 1000; // Placeholder — enterprise credits are custom
      default:
        return BILLING_CONFIG.FREE_CREDITS_PER_MONTH;
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
                {t('settings.planBilling.credits.overageInfo', {
                  price: getFormattedOveragePrice(),
                  defaultValue: `Overage credits are billed at ${getFormattedOveragePrice()} per credit. You'll only pay for what you use beyond your monthly allowance.`,
                })}
              </Text>
            </Alert>
          </>
        )}

        {/* No overage message */}
        {(!usage || usage.currentPeriodCredits === 0) && tier !== 'free' && (
          <Alert color="green" variant="light">
            <Text size="sm">
              {t('settings.planBilling.credits.noOverage', {
                count: monthlyCredits,
                defaultValue: `No overage charges this month. You're using your included ${monthlyCredits} credits.`,
              })}
            </Text>
          </Alert>
        )}

        {/* Free tier message */}
        {tier === 'free' && (
          <Alert color="blue" variant="light">
            <Text size="sm">
              {t('settings.planBilling.credits.freeTierInfo', {
                freeCredits: BILLING_CONFIG.FREE_CREDITS_PER_MONTH,
                teamCredits: BILLING_CONFIG.INCLUDED_CREDITS_PER_MONTH,
                defaultValue: `Free plan includes ${BILLING_CONFIG.FREE_CREDITS_PER_MONTH} credits per month. Upgrade to Team for ${BILLING_CONFIG.INCLUDED_CREDITS_PER_MONTH} credits/month and pay-as-you-go overage billing.`,
              })}
            </Text>
          </Alert>
        )}
      </Stack>
    </Card>
  );
}
