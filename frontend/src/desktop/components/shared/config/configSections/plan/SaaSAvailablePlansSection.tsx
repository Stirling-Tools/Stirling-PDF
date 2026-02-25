import React from 'react';
import { Text, SimpleGrid, Loader, Alert, Center } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { PlanTier } from '@app/hooks/useSaaSPlans';
import { SaasPlanCard } from '@app/components/shared/config/configSections/plan/SaasPlanCard';
import { useSaaSCheckout } from '@app/contexts/SaaSCheckoutContext';
import type { TierLevel } from '@app/types/billing';

interface SaaSAvailablePlansSectionProps {
  plans: PlanTier[];
  currentTier?: TierLevel;
  loading?: boolean;
  error?: string | null;
}

export const SaaSAvailablePlansSection: React.FC<SaaSAvailablePlansSectionProps> = ({
  plans,
  currentTier,
  loading,
  error
}) => {
  const { t } = useTranslation();
  const { openCheckout } = useSaaSCheckout();

  const handleUpgradeClick = (plan: PlanTier) => {
    if (plan.isContactOnly) {
      // Handled by mailto link in the card
      return;
    }

    if (plan.id === currentTier) {
      // Already on this plan
      return;
    }

    console.log('[SaaSAvailablePlansSection] Upgrade clicked for plan:', plan.id);
    openCheckout(plan.id);
  };

  if (loading) {
    return (
      <Center py="xl">
        <Loader size="md" />
      </Center>
    );
  }

  if (error) {
    return (
      <Alert color="orange" variant="light" mt="md">
        <Text size="sm">
          {t('plan.availablePlans.loadError', 'Unable to load plan pricing. Using default values.')}
        </Text>
      </Alert>
    );
  }

  return (
    <div>
      <Text size="lg" fw={600} mb="md">
        {t('plan.availablePlans.title', 'Available Plans')}
      </Text>
      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
        {plans.map(plan => (
          <SaasPlanCard
            key={plan.id}
            plan={plan}
            isCurrentPlan={plan.id === currentTier}
            currentTier={currentTier}
            onUpgradeClick={handleUpgradeClick}
          />
        ))}
      </SimpleGrid>
    </div>
  );
};
