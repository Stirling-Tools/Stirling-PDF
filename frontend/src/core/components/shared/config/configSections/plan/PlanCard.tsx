import React from 'react';
import { Button, Card, Badge, Text, Group, Stack } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { PlanTier } from '@app/services/licenseService';

interface PlanCardProps {
  plan: PlanTier;
  isCurrentPlan: boolean;
  onUpgradeClick: (plan: PlanTier) => void;
}

const PlanCard: React.FC<PlanCardProps> = ({ plan, isCurrentPlan, onUpgradeClick }) => {
  const { t } = useTranslation();

  return (
    <Card
      key={plan.id}
      padding="lg"
      radius="md"
      withBorder
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {plan.popular && (
        <Badge
          variant="filled"
          size="xs"
          style={{ position: 'absolute', top: '0.5rem', right: '0.5rem' }}
        >
          {t('plan.popular', 'Popular')}
        </Badge>
      )}

      <Stack gap="md" style={{ height: '100%' }}>
        <div>
          <Text size="lg" fw={600}>
            {plan.name}
          </Text>
          <Group gap="xs" style={{ alignItems: 'baseline' }}>
            <Text size="xl" fw={700} style={{ fontSize: '2rem' }}>
              {plan.isContactOnly
                ? t('plan.customPricing', 'Custom')
                : `${plan.currency}${plan.price}`}
            </Text>
            {!plan.isContactOnly && (
              <Text size="sm" c="dimmed">
                {plan.period}
              </Text>
            )}
          </Group>
        </div>

        <Stack gap="xs">
          {plan.highlights.map((highlight, index) => (
            <Text key={index} size="sm" c="dimmed">
              • {highlight}
            </Text>
          ))}
        </Stack>

        <div style={{ flexGrow: 1 }} />

        <Button
          variant={isCurrentPlan ? 'filled' : plan.isContactOnly ? 'outline' : 'filled'}
          disabled={isCurrentPlan}
          fullWidth
          onClick={() => onUpgradeClick(plan)}
        >
          {isCurrentPlan
            ? t('plan.current', 'Current Plan')
            : plan.isContactOnly
              ? t('plan.contact', 'Contact Us')
              : t('plan.upgrade', 'Upgrade')}
        </Button>
      </Stack>
    </Card>
  );
};

export default PlanCard;
