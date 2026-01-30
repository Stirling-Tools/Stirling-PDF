import React, { useState, useMemo } from 'react';
import { Button, Collapse, Select, Group } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import licenseService, { PlanTier, PlanTierGroup, LicenseInfo, mapLicenseToTier } from '@app/services/licenseService';
import PlanCard from '@app/components/shared/config/configSections/plan/PlanCard';
import FeatureComparisonTable from '@app/components/shared/config/configSections/plan/FeatureComparisonTable';
import { Z_INDEX_OVER_CONFIG_MODAL } from '@app/styles/zIndex';
import { isCurrentTier as checkIsCurrentTier, isDowngrade as checkIsDowngrade } from '@app/utils/planTierUtils';

interface AvailablePlansSectionProps {
  plans: PlanTier[];
  currentPlanId?: string;
  currentLicenseInfo?: LicenseInfo | null;
  onUpgradeClick: (planGroup: PlanTierGroup) => void;
  onManageClick?: () => void;
  currency?: string;
  onCurrencyChange?: (currency: string) => void;
  currencyOptions?: { value: string; label: string }[];
  loginEnabled?: boolean;
}

const AvailablePlansSection: React.FC<AvailablePlansSectionProps> = ({
  plans,
  currentLicenseInfo,
  onUpgradeClick,
  onManageClick,
  currency,
  onCurrencyChange,
  currencyOptions,
  loginEnabled = true,
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
    return checkIsCurrentTier(currentTier, tierGroup.tier);
  };

  // Determine if selecting this plan would be a downgrade
  const isDowngrade = (tierGroup: PlanTierGroup): boolean => {
    return checkIsDowngrade(currentTier, tierGroup.tier);
  };

  return (
    <div>
      <Group justify="space-between" align="flex-start" mb="xs">
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
            onChange={(value) => onCurrencyChange(value || 'usd')}
            data={currencyOptions}
            searchable
            clearable={false}
            w={300}
            comboboxProps={{ withinPortal: true, zIndex: Z_INDEX_OVER_CONFIG_MODAL }}
            disabled={!loginEnabled}
          />
        )}
      </Group>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '1rem',
          marginBottom: '0.1rem',
        }}
      >
        {groupedPlans.map((group) => (
          <PlanCard
            key={group.tier}
            planGroup={group}
            isCurrentTier={isCurrentTier(group)}
            isDowngrade={isDowngrade(group)}
            currentLicenseInfo={currentLicenseInfo}
            currentTier={currentTier}
            onUpgradeClick={onUpgradeClick}
            onManageClick={onManageClick}
            loginEnabled={loginEnabled}
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
        <FeatureComparisonTable plans={groupedPlans} currentTier={currentTier} />
      </Collapse>
    </div>
  );
};

export default AvailablePlansSection;
