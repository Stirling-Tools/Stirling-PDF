import React, { useState } from 'react';
import { Button, Card, Badge, Text, Collapse } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { PlanTier } from '@app/services/licenseService';
import PlanCard from './PlanCard';

interface AvailablePlansSectionProps {
  plans: PlanTier[];
  currentPlanId: string;
  onUpgradeClick: (plan: PlanTier) => void;
}

const AvailablePlansSection: React.FC<AvailablePlansSectionProps> = ({
  plans,
  currentPlanId,
  onUpgradeClick,
}) => {
  const { t } = useTranslation();
  const [showComparison, setShowComparison] = useState(false);

  return (
    <div>
      <h3 style={{ margin: 0, color: 'var(--mantine-color-text)', fontSize: '1rem' }}>
        {t('plan.availablePlans.title', 'Available Plans')}
      </h3>
      <p
        style={{
          margin: '0.25rem 0 1rem 0',
          color: 'var(--mantine-color-dimmed)',
          fontSize: '0.875rem',
        }}
      >
        {t('plan.availablePlans.subtitle', 'Choose the plan that fits your needs')}
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '1rem',
          marginBottom: '1rem',
        }}
      >
        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            isCurrentPlan={plan.id === currentPlanId}
            onUpgradeClick={onUpgradeClick}
          />
        ))}
      </div>

      <div style={{ textAlign: 'center' }}>
        <Button variant="subtle" onClick={() => setShowComparison(!showComparison)}>
          {showComparison
            ? t('plan.hideComparison', 'Hide Feature Comparison')
            : t('plan.showComparison', 'Compare All Features')}
        </Button>
      </div>

      <Collapse in={showComparison}>
        <Card padding="lg" radius="md" withBorder style={{ marginTop: '1rem' }}>
          <Text size="lg" fw={600} mb="md">
            {t('plan.featureComparison', 'Feature Comparison')}
          </Text>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--mantine-color-gray-3)' }}>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>
                    {t('plan.feature.title', 'Feature')}
                  </th>
                  {plans.map((plan) => (
                    <th
                      key={plan.id}
                      style={{ textAlign: 'center', padding: '0.5rem', minWidth: '6rem', position: 'relative' }}
                    >
                      {plan.name}
                      {plan.popular && (
                        <Badge
                          color="blue"
                          variant="filled"
                          style={{
                            position: 'absolute',
                            top: '0rem',
                            right: '-2rem',
                            fontSize: '0.5rem',
                            fontWeight: '500',
                            height: '1rem',
                            padding: '0 0.25rem',
                          }}
                        >
                          {t('plan.popular', 'Popular')}
                        </Badge>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {plans[0].features.map((_, featureIndex) => (
                  <tr
                    key={featureIndex}
                    style={{ borderBottom: '1px solid var(--mantine-color-gray-3)' }}
                  >
                    <td style={{ padding: '0.5rem' }}>{plans[0].features[featureIndex].name}</td>
                    {plans.map((plan) => (
                      <td key={plan.id} style={{ textAlign: 'center', padding: '0.5rem' }}>
                        {plan.features[featureIndex].included ? (
                          <Text c="green" fw={600}>
                            ✓
                          </Text>
                        ) : (
                          <Text c="gray">-</Text>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </Collapse>
    </div>
  );
};

export default AvailablePlansSection;
