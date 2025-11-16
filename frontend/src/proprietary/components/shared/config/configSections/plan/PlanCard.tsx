import React from 'react';
import { Button, Card, Badge, Text, Group, Stack, Divider } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { PlanTierGroup } from '@app/services/licenseService';

interface PlanCardProps {
  planGroup: PlanTierGroup;
  isCurrentTier: boolean;
  onUpgradeClick: (planGroup: PlanTierGroup) => void;
}

const PlanCard: React.FC<PlanCardProps> = ({ planGroup, isCurrentTier, onUpgradeClick }) => {
  const { t } = useTranslation();

  // Render Free plan
  if (planGroup.tier === 'free') {
    return (
      <Card
        padding="lg"
        radius="md"
        withBorder
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          minHeight: '400px',
        }}
      >
        <Stack gap="md" style={{ height: '100%' }}>
          <div>
            <Text size="xl" fw={700} mb="xs">
              {planGroup.name}
            </Text>
            <Text size="2.5rem" fw={700} style={{ lineHeight: 1 }}>
              £0
            </Text>
            <Text size="sm" c="dimmed" mt="xs">
              {t('plan.free.forever', 'Forever free')}
            </Text>
          </div>

          <Stack gap="xs" mt="md">
            {planGroup.highlights.map((highlight, index) => (
              <Text key={index} size="sm" c="dimmed">
                • {highlight}
              </Text>
            ))}
          </Stack>

          <div style={{ flexGrow: 1 }} />

          <Button variant="filled" disabled fullWidth>
            {isCurrentTier
              ? t('plan.current', 'Current Plan')
              : t('plan.free.included', 'Included')}
          </Button>
        </Stack>
      </Card>
    );
  }

  // Render Server or Enterprise plans
  const { monthly, yearly } = planGroup;
  const isEnterprise = planGroup.tier === 'enterprise';

  // Calculate "From" pricing - show yearly price divided by 12 for lowest monthly equivalent
  let displayPrice = monthly?.price || 0;
  let displaySeatPrice = monthly?.seatPrice;
  let displayCurrency = monthly?.currency || '£';
  let isYearlyPrice = false;

  if (yearly) {
    displayPrice = Math.round(yearly.price / 12);
    displaySeatPrice = yearly.seatPrice ? Math.round(yearly.seatPrice / 12) : undefined;
    displayCurrency = yearly.currency;
    isYearlyPrice = true;
  }

  return (
    <Card
      padding="lg"
      radius="md"
      withBorder
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        minHeight: '400px',
      }}
    >
      {planGroup.popular && (
        <Badge
          variant="filled"
          size="sm"
          style={{ position: 'absolute', top: '1rem', right: '1rem' }}
        >
          {t('plan.popular', 'Popular')}
        </Badge>
      )}

      <Stack gap="md" style={{ height: '100%' }}>
        {/* Tier Name */}
        <div>
          <Text size="xl" fw={700}>
            {planGroup.name}
          </Text>
        </div>

        {/* "From" Pricing */}
        <div>
          <Text size="xs" c="dimmed" mb="xs">
            {t('plan.from', 'From')}
          </Text>

          {isEnterprise && displaySeatPrice !== undefined ? (
            <div>
              <Group gap="xs" align="baseline">
                <Text size="xl" fw={700}>
                  {displayCurrency}{displayPrice}
                </Text>
                <Text size="sm" c="dimmed">
                  {t('plan.perMonth', '/month')}
                </Text>
              </Group>
              <Text size="sm" c="dimmed">
                + {displayCurrency}{displaySeatPrice}/seat/month
              </Text>
            </div>
          ) : (
            <Group gap="xs" align="baseline">
              <Text size="xl" fw={700}>
                {displayCurrency}{displayPrice}
              </Text>
              <Text size="sm" c="dimmed">
                {t('plan.perMonth', '/month')}
              </Text>
            </Group>
          )}


        </div>

        <Divider />

        {/* Highlights */}
        <Stack gap="xs">
          {planGroup.highlights.map((highlight, index) => (
            <Text key={index} size="sm" c="dimmed">
              • {highlight}
            </Text>
          ))}
        </Stack>

        <div style={{ flexGrow: 1 }} />

        {/* Single Upgrade Button */}
        <Button
          variant={isCurrentTier ? 'light' : 'filled'}
          fullWidth
          onClick={() => onUpgradeClick(planGroup)}
          disabled={isCurrentTier}
        >
          {isCurrentTier
            ? t('plan.current', 'Current Plan')
            : isEnterprise
              ? t('plan.selectPlan', 'Select Plan')
              : t('plan.upgrade', 'Upgrade')}
        </Button>
      </Stack>
    </Card>
  );
};

export default PlanCard;
