import React, { useState, useCallback, useEffect } from 'react';
import { Divider, Loader, Alert, Select, Group, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { usePlans } from '@app/hooks/usePlans';
import { PlanTier } from '@app/services/licenseService';
import StripeCheckout from '@app/components/shared/StripeCheckout';
import AvailablePlansSection from './plan/AvailablePlansSection';
import ActivePlanSection from './plan/ActivePlanSection';
import StaticPlanSection from './plan/StaticPlanSection';
import { userManagementService } from '@app/services/userManagementService';
import { useAppConfig } from '@app/contexts/AppConfigContext';

const AdminPlanSection: React.FC = () => {
  const { t } = useTranslation();
  const { config } = useAppConfig();
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<PlanTier | null>(null);
  const [currency, setCurrency] = useState<string>('gbp');
  const [useStaticVersion, setUseStaticVersion] = useState(false);
  const [currentLicenseInfo, setCurrentLicenseInfo] = useState<any>(null);
  const { plans, currentSubscription, loading, error, refetch } = usePlans(currency);

  // Check if we should use static version and fetch license info
  useEffect(() => {
    const fetchLicenseInfo = async () => {
      try {
        const adminData = await userManagementService.getUsers();

        // Determine plan name based on config flags
        let planName = 'Free';
        if (config?.runningEE) {
          planName = 'Enterprise';
        } else if (config?.runningProOrHigher || adminData.premiumEnabled) {
          planName = 'Pro';
        }

        setCurrentLicenseInfo({
          planName,
          maxUsers: adminData.maxAllowedUsers,
          grandfathered: adminData.grandfatheredUserCount > 0,
        });
      } catch (err) {
        console.error('Failed to fetch license info:', err);
      }
    };

    // Check if Stripe is configured
    const stripeKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
    if (!stripeKey || error) {
      setUseStaticVersion(true);
      fetchLicenseInfo();
    }
  }, [error, config]);

  const currencyOptions = [
    { value: 'gbp', label: 'British pound (GBP, £)' },
    { value: 'usd', label: 'US dollar (USD, $)' },
    { value: 'eur', label: 'Euro (EUR, €)' },
    { value: 'cny', label: 'Chinese yuan (CNY, ¥)' },
    { value: 'inr', label: 'Indian rupee (INR, ₹)' },
    { value: 'brl', label: 'Brazilian real (BRL, R$)' },
    { value: 'idr', label: 'Indonesian rupiah (IDR, Rp)' },
  ];

  const handleUpgradeClick = useCallback(
    (plan: PlanTier) => {
      if (plan.isContactOnly) {
        // Open contact form or redirect to contact page
        window.open('mailto:sales@stirlingpdf.com?subject=Enterprise Plan Inquiry', '_blank');
        return;
      }

      if (!currentSubscription || plan.id !== currentSubscription.plan.id) {
        setSelectedPlan(plan);
        setCheckoutOpen(true);
      }
    },
    [currentSubscription]
  );

  const handlePaymentSuccess = useCallback(
    (sessionId: string) => {
      console.log('Payment successful, session:', sessionId);

      // Refetch plans to update current subscription
      refetch();

      // Close modal after brief delay to show success message
      setTimeout(() => {
        setCheckoutOpen(false);
        setSelectedPlan(null);
      }, 2000);
    },
    [refetch]
  );

  const handlePaymentError = useCallback((error: string) => {
    console.error('Payment error:', error);
    // Error is already displayed in the StripeCheckout component
  }, []);

  const handleCheckoutClose = useCallback(() => {
    setCheckoutOpen(false);
    setSelectedPlan(null);
  }, []);

  // Show static version if Stripe is not configured or there's an error
  if (useStaticVersion) {
    return <StaticPlanSection currentLicenseInfo={currentLicenseInfo} />;
  }

  // Early returns after all hooks are called
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '2rem 0' }}>
        <Loader size="lg" />
      </div>
    );
  }

  if (error) {
    // Fallback to static version on error
    return <StaticPlanSection currentLicenseInfo={currentLicenseInfo} />;
  }

  if (!plans || !currentSubscription) {
    return (
      <Alert color="yellow" title="No data available">
        Plans data is not available at the moment.
      </Alert>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Currency Selector */}
      <div>
        <Group justify="space-between" align="center" mb="md">
          <Text size="lg" fw={600}>
            {t('plan.currency', 'Currency')}
          </Text>
          <Select
            value={currency}
            onChange={(value) => setCurrency(value || 'gbp')}
            data={currencyOptions}
            searchable
            clearable={false}
            w={300}
          />
        </Group>
      </div>

      <ActivePlanSection subscription={currentSubscription} />

      <Divider />

      <AvailablePlansSection
        plans={plans}
        currentPlanId={currentSubscription.plan.id}
        onUpgradeClick={handleUpgradeClick}
      />

      {/* Stripe Checkout Modal */}
      {selectedPlan && (
        <StripeCheckout
          opened={checkoutOpen}
          onClose={handleCheckoutClose}
          planId={selectedPlan.id}
          planName={selectedPlan.name}
          planPrice={selectedPlan.price}
          currency={selectedPlan.currency}
          onSuccess={handlePaymentSuccess}
          onError={handlePaymentError}
        />
      )}
    </div>
  );
};

export default AdminPlanSection;
