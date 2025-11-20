import React, { useState, useMemo } from 'react';
import { Button, Card, Badge, Text, Collapse, Select, Group } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import licenseService, { PlanTier, PlanTierGroup, LicenseInfo, mapLicenseToTier } from '@app/services/licenseService';
import PlanCard from '@app/components/shared/config/configSections/plan/PlanCard';
import { Z_INDEX_OVER_CONFIG_MODAL } from '@app/styles/zIndex';

interface AvailablePlansSectionProps {
  plans: PlanTier[];
  currentPlanId?: string;
  currentLicenseInfo?: LicenseInfo | null;
  onUpgradeClick: (planGroup: PlanTierGroup) => void;
  currency?: string;
  onCurrencyChange?: (value: string) => void;
  currencyOptions?: Array<{ value: string; label: string }>;
}

const AvailablePlansSection: React.FC<AvailablePlansSectionProps> = ({
  plans,
  currentLicenseInfo,
  onUpgradeClick,
  currency,
  onCurrencyChange,
  currencyOptions,
}) => {
  const { t } = useTranslation();
  const [showComparison, setShowComparison] = useState(false);

  // Group plans by tier (Free, Server, Enterprise)
  const groupedPlans = useMemo(() => {
    return licenseService.groupPlansByTier(plans);
  }, [plans]);

  // Calculate current tier from license info
  const currentTier = useMemo(() => {
    return mapLicenseToTier(currentLicenseInfo || null);
  }, [currentLicenseInfo]);

  // Determine if the current tier matches (checks both Stripe subscription and license)
  const isCurrentTier = (tierGroup: PlanTierGroup): boolean => {
    // Check license tier match
    if (currentTier && tierGroup.tier === currentTier) {
      return true;
    }
    return false;
  };

  // Determine if selecting this plan would be a downgrade
  const isDowngrade = (tierGroup: PlanTierGroup): boolean => {
    if (!currentTier) return false;

    // Define tier hierarchy: enterprise > server > free
    const tierHierarchy: Record<string, number> = {
      'enterprise': 3,
      'server': 2,
      'free': 1
    };

    const currentLevel = tierHierarchy[currentTier] || 0;
    const targetLevel = tierHierarchy[tierGroup.tier] || 0;

    return currentLevel > targetLevel;
  };

  return (
    <div>
      <Group justify="space-between" align="flex-start" mb="1rem">
        <div>
          <h3 style={{ margin: 0, color: 'var(--mantine-color-text)', fontSize: '1rem' }}>
            {t('plan.availablePlans.title', 'Available Plans')}
          </h3>
          <p
            style={{
              margin: '0.25rem 0 0 0',
              color: 'var(--mantine-color-dimmed)',
              fontSize: '0.875rem',
            }}
          >
            {t('plan.availablePlans.subtitle', 'Choose the plan that fits your needs')}
          </p>
        </div>
        {currency && onCurrencyChange && currencyOptions && (
          <Select
            value={currency}
            onChange={(value) => onCurrencyChange(value || 'gbp')}
            data={currencyOptions}
            searchable
            clearable={false}
            w={300}
            comboboxProps={{ withinPortal: true, zIndex: Z_INDEX_OVER_CONFIG_MODAL }}
          />
        )}
      </Group>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '1rem',
          marginBottom: '1rem',
        }}
      >
        {groupedPlans.map((group) => (
          <PlanCard
            key={group.tier}
            planGroup={group}
            isCurrentTier={isCurrentTier(group)}
            isDowngrade={isDowngrade(group)}
            currentLicenseInfo={currentLicenseInfo}
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
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--mantine-color-gray-3)' }}>
                  <th style={{ textAlign: 'left', padding: '0.75rem' }}>
                    {t('plan.feature.title', 'Feature')}
                  </th>
                  {groupedPlans.map((group) => (
                    <th
                      key={group.tier}
                      style={{
                        textAlign: 'center',
                        padding: '0.75rem',
                        minWidth: '8rem',
                        position: 'relative'
                      }}
                    >
                      {group.name}
                      {group.popular && (
                        <Badge
                          color="blue"
                          variant="filled"
                          size="xs"
                          style={{
                            position: 'absolute',
                            top: '0rem',
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
                {groupedPlans[0]?.features.map((_, featureIndex) => (
                  <tr
                    key={featureIndex}
                    style={{ borderBottom: '1px solid var(--mantine-color-gray-3)' }}
                  >
                    <td style={{ padding: '0.75rem' }}>
                      {groupedPlans[0].features[featureIndex].name}
                    </td>
                    {groupedPlans.map((group) => (
                      <td key={group.tier} style={{ textAlign: 'center', padding: '0.75rem' }}>
                        {group.features[featureIndex]?.included ? (
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
      </Collapse>
    </div>
  );
};

export default AvailablePlansSection;
