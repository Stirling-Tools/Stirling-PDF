import React from 'react';
import { Card, Badge, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { PlanFeature } from '@app/services/licenseService';

interface PlanWithFeatures {
  name: string;
  features: PlanFeature[];
  popular?: boolean;
  tier?: string;
}

interface FeatureComparisonTableProps {
  plans: PlanWithFeatures[];
}

const FeatureComparisonTable: React.FC<FeatureComparisonTableProps> = ({ plans }) => {
  const { t } = useTranslation();

  return (
    <Card padding="lg" radius="md" withBorder style={{ marginTop: '1rem' }}>
      <Text size="lg" fw={600} mb="md">
        {t('plan.featureComparison', 'Feature Comparison')}
      </Text>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--mantine-color-gray-3)' }}>
              <th style={{ textAlign: 'left', padding: '0.75rem' }}>
                {t('plan.feature.title', 'Feature')}
              </th>
              {plans.map((plan, index) => (
                <th
                  key={plan.tier || plan.name || index}
                  style={{
                    textAlign: 'center',
                    padding: '0.75rem',
                    minWidth: '8rem',
                    position: 'relative'
                  }}
                >
                  {plan.name}
                  {plan.popular && (
                    <Badge
                      color="blue"
                      variant="filled"
                      size="xs"
                      style={{
                        position: 'absolute',
                        top: '0.5rem',
                        right: '0.5rem',
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
            {plans[0]?.features.map((_, featureIndex) => (
              <tr
                key={featureIndex}
                style={{ borderBottom: '1px solid var(--mantine-color-gray-3)' }}
              >
                <td style={{ padding: '0.75rem' }}>
                  {plans[0].features[featureIndex].name}
                </td>
                {plans.map((plan, planIndex) => (
                  <td key={planIndex} style={{ textAlign: 'center', padding: '0.75rem' }}>
                    {plan.features[featureIndex]?.included ? (
                      <Text c="green" fw={600} size="lg">
                        ✓
                      </Text>
                    ) : (
                      <Text c="gray" size="sm">
                        −
                      </Text>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

export default FeatureComparisonTable;
