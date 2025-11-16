import React from 'react';
import { Card, Text, Group, Stack, Badge } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { SubscriptionInfo } from '@app/services/licenseService';
import { ManageBillingButton } from '@app/components/shared/ManageBillingButton';

interface ActivePlanSectionProps {
  subscription: SubscriptionInfo;
}

const ActivePlanSection: React.FC<ActivePlanSectionProps> = ({ subscription }) => {
  const { t } = useTranslation();

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<
      string,
      { color: string; label: string }
    > = {
      active: { color: 'green', label: t('subscription.status.active', 'Active') },
      past_due: { color: 'yellow', label: t('subscription.status.pastDue', 'Past Due') },
      canceled: { color: 'red', label: t('subscription.status.canceled', 'Canceled') },
      incomplete: { color: 'orange', label: t('subscription.status.incomplete', 'Incomplete') },
      trialing: { color: 'blue', label: t('subscription.status.trialing', 'Trial') },
      none: { color: 'gray', label: t('subscription.status.none', 'No Subscription') },
    };

    const config = statusConfig[status] || statusConfig.none;
    return (
      <Badge color={config.color} variant="light">
        {config.label}
      </Badge>
    );
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, color: 'var(--mantine-color-text)', fontSize: '1rem' }}>
          {t('plan.activePlan.title', 'Active Plan')}
        </h3>
        {subscription.status !== 'none' && subscription.stripeCustomerId && (
          <ManageBillingButton returnUrl={`${window.location.origin}/settings/adminPlan`} />
        )}
      </div>
      <p
        style={{
          margin: '0.25rem 0 1rem 0',
          color: 'var(--mantine-color-dimmed)',
          fontSize: '0.875rem',
        }}
      >
        {t('plan.activePlan.subtitle', 'Your current subscription details')}
      </p>

      <Card padding="lg" radius="md" withBorder>
        <Group justify="space-between" align="center">
          <Stack gap="xs">
            <Group gap="sm">
              <Text size="lg" fw={600}>
                {subscription.plan.name}
              </Text>
              {getStatusBadge(subscription.status)}
            </Group>
            {subscription.currentPeriodEnd && subscription.status === 'active' && (
              <Text size="sm" c="dimmed">
                {subscription.cancelAtPeriodEnd
                  ? t('subscription.cancelsOn', 'Cancels on {{date}}', {
                      date: new Date(subscription.currentPeriodEnd).toLocaleDateString(),
                    })
                  : t('subscription.renewsOn', 'Renews on {{date}}', {
                      date: new Date(subscription.currentPeriodEnd).toLocaleDateString(),
                    })}
              </Text>
            )}
          </Stack>
          <div style={{ textAlign: 'right' }}>
            <Text size="xl" fw={700}>
              {subscription.plan.currency}
              {subscription.plan.price}
              /month
            </Text>
          </div>
        </Group>
      </Card>
    </div>
  );
};

export default ActivePlanSection;
