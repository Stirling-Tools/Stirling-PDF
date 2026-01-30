import React from 'react';
import { Button, Card, Text, Stack, Divider, Tooltip } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { PlanTierGroup, LicenseInfo } from '@app/services/licenseService';
import { PricingBadge } from '@app/components/shared/stripeCheckout/components/PricingBadge';
import { PriceDisplay } from '@app/components/shared/stripeCheckout/components/PriceDisplay';
import { calculateDisplayPricing } from '@app/components/shared/stripeCheckout/utils/pricingUtils';
import { getBaseCardStyle } from '@app/components/shared/stripeCheckout/utils/cardStyles';
import { isEnterpriseBlockedForFree as checkIsEnterpriseBlockedForFree } from '@app/utils/planTierUtils';

interface PlanCardProps {
  planGroup: PlanTierGroup;
  isCurrentTier: boolean;
  isDowngrade: boolean;
  currentLicenseInfo?: LicenseInfo | null;
  currentTier?: 'free' | 'server' | 'enterprise' | null;
  onUpgradeClick: (planGroup: PlanTierGroup) => void;
  onManageClick?: () => void;
  loginEnabled?: boolean;
}

const PlanCard: React.FC<PlanCardProps> = ({ planGroup, isCurrentTier, isDowngrade, currentLicenseInfo, currentTier, onUpgradeClick, onManageClick, loginEnabled = true }) => {
  const { t } = useTranslation();

  // Render Free plan
  if (planGroup.tier === 'free') {
    // Get currency from the free plan
    const freeCurrency = planGroup.monthly?.currency || '$';

    return (
      <Card
        padding="lg"
        radius="md"
        withBorder
        style={getBaseCardStyle(isCurrentTier)}
        className="plan-card"
      >
        {isCurrentTier && (
          <PricingBadge
            type="current"
            label={t('plan.current', 'Current Plan')}
          />
        )}
        <Stack gap="md" style={{ height: '100%' }}>
          <div>
            <Text size="xl" fw={700} mb="xs">
              {planGroup.name}
            </Text>
            <Text size="xs" c="dimmed" mb="xs" style={{ opacity: 0 }}>
              {t('plan.from', 'From')}
            </Text>
            <PriceDisplay
              mode="simple"
              price={0}
              currency={freeCurrency}
              period={t('plan.free.forever', 'Forever free')}
            />
          </div>

          <Divider />

          <Stack gap="xs">
            {planGroup.highlights.map((highlight, index) => (
              <Text key={index} size="sm" c="dimmed">
                • {highlight}
              </Text>
            ))}
          </Stack>

          <div style={{ flexGrow: 1 }} />

          <Button variant="filled" disabled fullWidth className="plan-button">
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

  // Block enterprise for free tier users (must have server first)
  const isEnterpriseBlockedForFree = checkIsEnterpriseBlockedForFree(currentTier, planGroup.tier);

  // Calculate "From" pricing - show yearly price divided by 12 for lowest monthly equivalent
  const { displayPrice, displaySeatPrice, displayCurrency } = calculateDisplayPricing(
    monthly || undefined,
    yearly || undefined
  );

  return (
    <Card
      padding="lg"
      radius="md"
      withBorder
      style={getBaseCardStyle(isCurrentTier)}
      className="plan-card"
    >
      {isCurrentTier ? (
        <PricingBadge
          type="current"
          label={t('plan.current', 'Current Plan')}
        />
      ) : planGroup.popular && !(planGroup.tier === 'server' && currentTier === 'enterprise') ? (
        <PricingBadge
          type="popular"
          label={t('plan.popular', 'Popular')}
        />
      ) : null}

      <Stack gap="md" style={{ height: '100%' }}>
        {/* Tier Name */}
        <div>
          <Text size="xl" fw={700} mb="xs">
            {planGroup.name}
          </Text>

          <Text size="xs" c="dimmed" mb="xs">
            {t('plan.from', 'From')}
          </Text>

          {/* Price */}
          {isEnterprise && displaySeatPrice !== undefined ? (
            <>
              <Text span size="2.25rem" fw={600} style={{ lineHeight: 1 }}>
                {displayCurrency}{displaySeatPrice.toFixed(2)}
              </Text>
              <Text span size="1.5rem" c="dimmed" mt="xs">
                {t('plan.perSeat', '/seat')}
              </Text>
              <Text size="sm" c="dimmed" mt="xs">
                {t('plan.perMonth', '/month')} {t('plan.withServer', '+ Server Plan')}
              </Text>
            </>
          ) : (
            <PriceDisplay
              mode="simple"
              price={displayPrice}
              currency={displayCurrency}
              period={t('plan.perMonth', '/month')}
            />
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

      <Stack gap="xs">
        {/* Show seat count for enterprise plans when current */}
        {isEnterprise && isCurrentTier && currentLicenseInfo && currentLicenseInfo.maxUsers > 0 && (
          <Text size="sm" c="green" fw={500} ta="center">
            {t('plan.licensedSeats', 'Licensed: {{count}} seats', { count: currentLicenseInfo.maxUsers })}
          </Text>
        )}

        {/* Single Upgrade Button */}
        <Tooltip
          label={t('plan.enterprise.requiresServer', 'Requires Server plan')}
          disabled={!isEnterpriseBlockedForFree}
          position="top"
          withArrow
        >
          <Button
            variant="filled"
            fullWidth
            onClick={() => isCurrentTier && onManageClick ? onManageClick() : onUpgradeClick(planGroup)}
            disabled={!loginEnabled || isDowngrade || isEnterpriseBlockedForFree}
            className="plan-button"
          >
            {isCurrentTier
              ? t('plan.manage', 'Manage')
              : isDowngrade
                ? t('plan.free.included', 'Included')
                : isEnterpriseBlockedForFree
                  ? t('plan.enterprise.requiresServer', 'Requires Server')
                  : isEnterprise
                    ? t('plan.selectPlan', 'Select Plan')
                    : t('plan.upgrade', 'Upgrade')}
          </Button>
        </Tooltip>

        </Stack>
      </Stack>
    </Card>
  );
};

export default PlanCard;
