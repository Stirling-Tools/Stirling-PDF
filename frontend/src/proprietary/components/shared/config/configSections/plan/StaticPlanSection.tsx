import React, { useState } from 'react';
import { Card, Text, Stack, Button, Collapse, Divider, Tooltip } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { alert } from '@app/components/toast';
import { LicenseInfo, mapLicenseToTier } from '@app/services/licenseService';
import { PLAN_FEATURES, PLAN_HIGHLIGHTS } from '@app/constants/planConstants';
import FeatureComparisonTable from '@app/components/shared/config/configSections/plan/FeatureComparisonTable';
import StaticCheckoutModal from '@app/components/shared/config/configSections/plan/StaticCheckoutModal';
import LicenseKeySection from '@app/components/shared/config/configSections/plan/LicenseKeySection';
import { STATIC_STRIPE_LINKS } from '@app/constants/staticStripeLinks';
import { PricingBadge } from '@app/components/shared/stripeCheckout/components/PricingBadge';
import { getBaseCardStyle } from '@app/components/shared/stripeCheckout/utils/cardStyles';
import { isCurrentTier as checkIsCurrentTier, isDowngrade as checkIsDowngrade, isEnterpriseBlockedForFree } from '@app/utils/planTierUtils';

interface StaticPlanSectionProps {
  currentLicenseInfo?: LicenseInfo;
}

const StaticPlanSection: React.FC<StaticPlanSectionProps> = ({ currentLicenseInfo }) => {
  const { t } = useTranslation();
  const [showComparison, setShowComparison] = useState(false);

  // Static checkout modal state
  const [checkoutModalOpened, setCheckoutModalOpened] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'server' | 'enterprise'>('server');
  const [isUpgrade, setIsUpgrade] = useState(false);

  const handleOpenCheckout = (plan: 'server' | 'enterprise', upgrade: boolean) => {
    // Prevent Free → Enterprise (must have Server first)
    const currentTier = mapLicenseToTier(currentLicenseInfo || null);
    if (currentTier === 'free' && plan === 'enterprise') {
      alert({
        alertType: 'warning',
        title: t('plan.enterprise.requiresServer', 'Server Plan Required'),
        body: t(
          'plan.enterprise.requiresServerMessage',
          'Please upgrade to the Server plan first before upgrading to Enterprise.'
        ),
      });
      return;
    }

    setSelectedPlan(plan);
    setIsUpgrade(upgrade);
    setCheckoutModalOpened(true);
  };

  const handleManageBilling = () => {
    // Show warning about email verification
    alert({
      alertType: 'warning',
      title: t('plan.static.billingPortal.title', 'Email Verification Required'),
      body: t(
        'plan.static.billingPortal.message',
        'You will need to verify your email address in the Stripe billing portal. Check your email for a login link.'
      ),
    });

    window.open(STATIC_STRIPE_LINKS.billingPortal, '_blank');
  };

  const staticPlans = [
    {
      id: 'free',
      name: t('plan.free.name', 'Free'),
      price: 0,
      currency: '£',
      period: '',
      highlights: PLAN_HIGHLIGHTS.FREE,
      features: PLAN_FEATURES.FREE,
      maxUsers: 5,
    },
    {
      id: 'server',
      name: 'Server',
      price: 0,
      currency: '',
      period: '',
      popular: false,
      highlights: PLAN_HIGHLIGHTS.SERVER_MONTHLY,
      features: PLAN_FEATURES.SERVER,
      maxUsers: 'Unlimited users',
    },
    {
      id: 'enterprise',
      name: t('plan.enterprise.name', 'Enterprise'),
      price: 0,
      currency: '',
      period: '',
      highlights: PLAN_HIGHLIGHTS.ENTERPRISE_MONTHLY,
      features: PLAN_FEATURES.ENTERPRISE,
      maxUsers: 'Custom',
    },
  ];

  const getCurrentPlan = () => {
    const tier = mapLicenseToTier(currentLicenseInfo || null);
    if (tier === 'enterprise') return staticPlans[2];
    if (tier === 'server') return staticPlans[1];
    return staticPlans[0]; // free
  };

  const currentPlan = getCurrentPlan();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

      {/* Available Plans */}
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
          {t('plan.static.contactToUpgrade', 'Contact us to upgrade or customize your plan')}
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '1rem',
            paddingBottom: '0.1rem',
          }}
        >
          {staticPlans.map((plan) => (
            <Card
              key={plan.id}
              padding="lg"
              radius="md"
              withBorder
              style={getBaseCardStyle(plan.id === currentPlan.id)}
              className="plan-card"
            >
              {plan.id === currentPlan.id && (
                <PricingBadge
                  type="current"
                  label={t('plan.current', 'Current Plan')}
                />
              )}
              {plan.popular && plan.id !== currentPlan.id && (
                <PricingBadge
                  type="popular"
                  label={t('plan.popular', 'Popular')}
                />
              )}

              <Stack gap="md" style={{ height: '100%' }}>
                <div>
                  <Text size="xl" fw={700} style={{ fontSize: '2rem' }}>
                    {plan.name}
                  </Text>
                  <Text size="xs" c="dimmed" mt="xs">
                    {typeof plan.maxUsers === 'string'
                      ? plan.maxUsers
                      : `${t('plan.static.upTo', 'Up to')} ${plan.maxUsers} ${t('workspace.people.license.users', 'users')}`}
                  </Text>
                </div>

                <Stack gap="xs">
                  {plan.highlights.map((highlight, index) => (
                    <Text key={index} size="sm" c="dimmed">
                      • {highlight}
                    </Text>
                  ))}
                </Stack>

                <div style={{ flexGrow: 1 }} />

                {/* Tier-based button logic */}
                {(() => {
                  const currentTier = mapLicenseToTier(currentLicenseInfo || null);
                  const isCurrent = checkIsCurrentTier(currentTier, plan.id);
                  const isDowngradePlan = checkIsDowngrade(currentTier, plan.id);

                  // Free Plan
                  if (plan.id === 'free') {
                    return (
                      <Button
                        variant="filled"
                        disabled
                        fullWidth
                        className="plan-button"
                      >
                        {isCurrent
                          ? t('plan.current', 'Current Plan')
                          : t('plan.free.included', 'Included')}
                      </Button>
                    );
                  }

                  // Server Plan
                  if (plan.id === 'server') {
                    if (currentTier === 'free') {
                      return (
                        <Button
                          variant="filled"
                          fullWidth
                          onClick={() => handleOpenCheckout('server', false)}
                          className="plan-button"
                        >
                          {t('plan.upgrade', 'Upgrade')}
                        </Button>
                      );
                    }
                    if (isCurrent) {
                      return (
                        <Button
                          variant="filled"
                          fullWidth
                          onClick={handleManageBilling}
                          className="plan-button"
                        >
                          {t('plan.manage', 'Manage')}
                        </Button>
                      );
                    }
                    if (isDowngradePlan) {
                      return (
                        <Button
                          variant="filled"
                          disabled
                          fullWidth
                          className="plan-button"
                        >
                          {t('plan.free.included', 'Included')}
                        </Button>
                      );
                    }
                  }

                  // Enterprise Plan
                  if (plan.id === 'enterprise') {
                    if (isEnterpriseBlockedForFree(currentTier, plan.id)) {
                      return (
                        <Tooltip label={t('plan.enterprise.requiresServer', 'Requires Server plan')} position="top" withArrow>
                          <Button
                            variant="filled"
                            disabled
                            fullWidth
                            className="plan-button"
                          >
                            {t('plan.enterprise.requiresServer', 'Requires Server')}
                          </Button>
                        </Tooltip>
                      );
                    }
                    if (currentTier === 'server') {
                      // TODO: Re-enable checkout flow when account syncing is ready
                      // return (
                      //   <Button
                      //     variant="filled"
                      //     fullWidth
                      //     onClick={() => handleOpenCheckout('enterprise', true)}
                      //     className="plan-button"
                      //   >
                      //     {t('plan.selectPlan', 'Select Plan')}
                      //   </Button>
                      // );
                      return (
                        <Button
                          variant="filled"
                          fullWidth
                          disabled
                          className="plan-button"
                        >
                          {t('plan.contact', 'Contact Us')}
                        </Button>
                      );
                    }
                    if (isCurrent) {
                      return (
                        <Button
                          variant="filled"
                          fullWidth
                          onClick={handleManageBilling}
                          className="plan-button"
                        >
                          {t('plan.manage', 'Manage')}
                        </Button>
                      );
                    }
                  }

                  return null;
                })()}
              </Stack>
            </Card>
          ))}
        </div>

        {/* Feature Comparison Toggle */}
        <div style={{ textAlign: 'center', marginTop: '1rem' }}>
          <Button variant="subtle" onClick={() => setShowComparison(!showComparison)}>
            {showComparison
              ? t('plan.hideComparison', 'Hide Feature Comparison')
              : t('plan.showComparison', 'Compare All Features')}
          </Button>
        </div>

        {/* Feature Comparison Table */}
        <Collapse in={showComparison}>
          <FeatureComparisonTable plans={staticPlans} />
        </Collapse>
      </div>

      <Divider />

      {/* License Key Section */}
      <LicenseKeySection currentLicenseInfo={currentLicenseInfo} />

      {/* Static Checkout Modal */}
      <StaticCheckoutModal
        opened={checkoutModalOpened}
        onClose={() => setCheckoutModalOpened(false)}
        planName={selectedPlan}
        isUpgrade={isUpgrade}
      />
    </div>
  );
};

export default StaticPlanSection;
