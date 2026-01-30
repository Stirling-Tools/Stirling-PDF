import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Divider, Loader, Alert } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { usePlans } from '@app/hooks/usePlans';
import licenseService, { PlanTierGroup, mapLicenseToTier } from '@app/services/licenseService';
import { useCheckout } from '@app/contexts/CheckoutContext';
import { useLicense } from '@app/contexts/LicenseContext';
import AvailablePlansSection from '@app/components/shared/config/configSections/plan/AvailablePlansSection';
import StaticPlanSection from '@app/components/shared/config/configSections/plan/StaticPlanSection';
import LicenseKeySection from '@app/components/shared/config/configSections/plan/LicenseKeySection';
import { alert } from '@app/components/toast';
import { InfoBanner } from '@app/components/shared/InfoBanner';
import { useLicenseAlert } from '@app/hooks/useLicenseAlert';
import { getPreferredCurrency, setCachedCurrency } from '@app/utils/currencyDetection';
import { useLoginRequired } from '@app/hooks/useLoginRequired';
import LoginRequiredBanner from '@core/components/shared/config/LoginRequiredBanner';
import { isSupabaseConfigured } from '@app/services/supabaseClient';

const AdminPlanSection: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { loginEnabled, validateLoginEnabled } = useLoginRequired();
  const { openCheckout } = useCheckout();
  const { licenseInfo } = useLicense();
  const [currency, setCurrency] = useState<string>(() => {
    // Initialize with auto-detected currency on first render
    return getPreferredCurrency(i18n.language);
  });
  const [useStaticVersion, setUseStaticVersion] = useState(false);
  const { plans, loading, error, refetch } = usePlans(currency);
  const licenseAlert = useLicenseAlert();

  // Check if we should use static version
  useEffect(() => {
    // Only use static version if Supabase is not configured or there's an error
    // Stripe key is not required - hosted checkout works without it
    if (!isSupabaseConfigured || error) {
      setUseStaticVersion(true);
    }
  }, [error]);

  const currencyOptions = [
    { value: 'gbp', label: 'British pound (GBP, £)' },
    { value: 'usd', label: 'US dollar (USD, $)' },
    { value: 'eur', label: 'Euro (EUR, €)' },
    { value: 'cny', label: 'Chinese yuan (CNY, ¥)' },
    { value: 'inr', label: 'Indian rupee (INR, ₹)' },
    { value: 'brl', label: 'Brazilian real (BRL, R$)' },
    { value: 'idr', label: 'Indonesian rupiah (IDR, Rp)' },
  ];

  const handleManageClick = useCallback(async () => {
    // Block access if login is disabled
    if (!validateLoginEnabled()) {
      return;
    }

    try {
      // Only allow PRO or ENTERPRISE licenses to access billing portal
      if (!licenseInfo?.licenseType || licenseInfo.licenseType === 'NORMAL') {
        throw new Error('No valid license found. Please purchase a license before accessing the billing portal.');
      }

      if (!licenseInfo?.licenseKey) {
        throw new Error('License key missing. Please contact support.');
      }

      // Create billing portal session with license key
      const response = await licenseService.createBillingPortalSession(
        window.location.href,
        licenseInfo.licenseKey
      );

      // Open billing portal in new tab
      window.open(response.url, '_blank');
    } catch (error: any) {
      console.error('Failed to open billing portal:', error);
      alert({
        alertType: 'error',
        title: t('billing.portal.error', 'Failed to open billing portal'),
        body: error.message || 'Please try again or contact support.',
      });
    }
  }, [licenseInfo, t, validateLoginEnabled]);

  const handleCurrencyChange = useCallback((newCurrency: string) => {
    setCurrency(newCurrency);
    // Persist user's manual selection to localStorage
    setCachedCurrency(newCurrency);
  }, []);

  const handleUpgradeClick = useCallback(
    (planGroup: PlanTierGroup) => {
      // Block access if login is disabled
      if (!validateLoginEnabled()) {
        return;
      }

      // Only allow upgrades for server and enterprise tiers
      if (planGroup.tier === 'free') {
        return;
      }

      // Prevent free tier users from directly accessing enterprise (must have server first)
      const currentTier = mapLicenseToTier(licenseInfo);
      if (currentTier === 'free' && planGroup.tier === 'enterprise') {
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

      // Use checkout context to open checkout modal
      openCheckout(planGroup.tier, {
        currency,
        onSuccess: () => {
          // Refetch plans after successful payment
          // License context will auto-update
          refetch();
        },
      });
    },
    [openCheckout, currency, refetch, licenseInfo, t, validateLoginEnabled]
  );

  const shouldShowLicenseWarning = licenseAlert.active && licenseAlert.audience === 'admin';
  const formattedUserCount = useMemo(() => {
    if (licenseAlert.totalUsers == null) {
      return t('plan.licenseWarning.overLimit', 'more than {{limit}}', {
        limit: licenseAlert.freeTierLimit,
      });
    }
    return licenseAlert.totalUsers.toLocaleString();
  }, [licenseAlert.totalUsers, licenseAlert.freeTierLimit, t]);

  const scrollToPlans = useCallback(() => {
    const el = document.getElementById('available-plans-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  // Show static version if Stripe is not configured or there's an error
  if (useStaticVersion) {
    return <StaticPlanSection currentLicenseInfo={licenseInfo ?? undefined} />;
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
    return <StaticPlanSection currentLicenseInfo={licenseInfo ?? undefined} />;
  }

  if (!plans || plans.length === 0) {
    return (
      <Alert color="yellow" title="No data available">
        Plans data is not available at the moment.
      </Alert>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <LoginRequiredBanner show={!loginEnabled} />

      {shouldShowLicenseWarning && (
        <InfoBanner
          icon="warning-rounded"
          tone="warning"
          title={t('plan.licenseWarning.title', 'Free self-hosted limit reached')}
          message={t('plan.licenseWarning.body', {
            total: formattedUserCount,
            limit: licenseAlert.freeTierLimit,
          })}
          buttonText={t('plan.licenseWarning.cta', 'See plans')}
          buttonIcon="upgrade-rounded"
          onButtonClick={scrollToPlans}
          dismissible={false}
          minHeight={68}
          background="#FFF4E6"
          borderColor="var(--mantine-color-orange-7)"
          textColor="#9A3412"
          iconColor="#EA580C"
          buttonVariant="filled"
          buttonColor="orange.7"
        />
      )}

      <AvailablePlansSection
        plans={plans}
        currentLicenseInfo={licenseInfo}
        onUpgradeClick={handleUpgradeClick}
        onManageClick={handleManageClick}
        currency={currency}
        onCurrencyChange={handleCurrencyChange}
        currencyOptions={currencyOptions}
        loginEnabled={loginEnabled}
      />

      <Divider />

      {/* License Key Section */}
      <LicenseKeySection currentLicenseInfo={licenseInfo ?? undefined} />
    </div>
  );
};

export default AdminPlanSection;
