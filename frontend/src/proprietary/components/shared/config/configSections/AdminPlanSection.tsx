import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Divider, Loader, Alert, Group, Text, Collapse, Button, TextInput, Stack, Paper } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { usePlans } from '@app/hooks/usePlans';
import licenseService, { PlanTierGroup, mapLicenseToTier } from '@app/services/licenseService';
import { useCheckout } from '@app/contexts/CheckoutContext';
import { useLicense } from '@app/contexts/LicenseContext';
import AvailablePlansSection from '@app/components/shared/config/configSections/plan/AvailablePlansSection';
import StaticPlanSection from '@app/components/shared/config/configSections/plan/StaticPlanSection';
import { alert } from '@app/components/toast';
import LocalIcon from '@app/components/shared/LocalIcon';
import { ManageBillingButton } from '@app/components/shared/ManageBillingButton';
import { InfoBanner } from '@app/components/shared/InfoBanner';
import { useLicenseAlert } from '@app/hooks/useLicenseAlert';
import { isSupabaseConfigured } from '@app/services/supabaseClient';
import { getPreferredCurrency, setCachedCurrency } from '@app/utils/currencyDetection';

const AdminPlanSection: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { openCheckout } = useCheckout();
  const { licenseInfo, refetchLicense } = useLicense();
  const [currency, setCurrency] = useState<string>(() => {
    // Initialize with auto-detected currency on first render
    return getPreferredCurrency(i18n.language);
  });
  const [useStaticVersion, setUseStaticVersion] = useState(false);
  const [showLicenseKey, setShowLicenseKey] = useState(false);
  const [licenseKeyInput, setLicenseKeyInput] = useState<string>('');
  const [savingLicense, setSavingLicense] = useState(false);
  const { plans, loading, error, refetch } = usePlans(currency);
  const licenseAlert = useLicenseAlert();

  // Check if we should use static version
  useEffect(() => {
    // Check if Stripe is configured
    const stripeKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
    if (!stripeKey || !isSupabaseConfigured || error) {
      setUseStaticVersion(true);
    }
  }, [error]);

  const handleSaveLicense = async () => {
    try {
      setSavingLicense(true);
      // Allow empty string to clear/remove license
      const response = await licenseService.saveLicenseKey(licenseKeyInput.trim());

      if (response.success) {
        // Refresh license context to update all components
        await refetchLicense();

        alert({
          alertType: 'success',
          title: t('admin.settings.premium.key.success', 'License Key Saved'),
          body: t('admin.settings.premium.key.successMessage', 'Your license key has been activated successfully. No restart required.'),
        });

        // Clear input
        setLicenseKeyInput('');
      } else {
        alert({
          alertType: 'error',
          title: t('admin.error', 'Error'),
          body: response.error || t('admin.settings.saveError', 'Failed to save license key'),
        });
      }
    } catch (error) {
      console.error('Failed to save license key:', error);
      alert({
        alertType: 'error',
        title: t('admin.error', 'Error'),
        body: t('admin.settings.saveError', 'Failed to save license key'),
      });
    } finally {
      setSavingLicense(false);
    }
  };

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
    try {
      if (!licenseInfo?.licenseKey) {
        throw new Error('No license key found. Please activate a license first.');
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
  }, [licenseInfo, t]);

  const handleCurrencyChange = useCallback((newCurrency: string) => {
    setCurrency(newCurrency);
    // Persist user's manual selection to localStorage
    setCachedCurrency(newCurrency);
  }, []);

  const handleUpgradeClick = useCallback(
    (planGroup: PlanTierGroup) => {
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
    [openCheckout, currency, refetch, licenseInfo, t]
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
      />

      <Divider />

      {/* License Key Section */}
      <div>
        <Button
          variant="subtle"
          leftSection={<LocalIcon icon={showLicenseKey ? "expand-less-rounded" : "expand-more-rounded"} width="1.25rem" height="1.25rem" />}
          onClick={() => setShowLicenseKey(!showLicenseKey)}
        >
          {t('admin.settings.premium.licenseKey.toggle', 'Got a license key or certificate file?')}
        </Button>

        <Collapse in={showLicenseKey} mt="md">
          <Stack gap="md">
            <Alert
              variant="light"
              color="blue"
              icon={<LocalIcon icon="info-rounded" width="1rem" height="1rem" />}
            >
              <Text size="sm">
                {t('admin.settings.premium.licenseKey.info', 'If you have a license key or certificate file from a direct purchase, you can enter it here to activate premium or enterprise features.')}
              </Text>
            </Alert>

            {/* Severe warning if license already exists */}
            {licenseInfo?.licenseKey && (
              <Alert
                variant="light"
                color="red"
                icon={<LocalIcon icon="warning-rounded" width="1rem" height="1rem" />}
                title={t('admin.settings.premium.key.overwriteWarning.title', '⚠️ Warning: Existing License Detected')}
              >
                <Stack gap="xs">
                  <Text size="sm" fw={600}>
                    {t('admin.settings.premium.key.overwriteWarning.line1', 'Overwriting your current license key cannot be undone.')}
                  </Text>
                  <Text size="sm">
                    {t('admin.settings.premium.key.overwriteWarning.line2', 'Your previous license will be permanently lost unless you have backed it up elsewhere.')}
                  </Text>
                  <Text size="sm" fw={500}>
                    {t('admin.settings.premium.key.overwriteWarning.line3', 'Important: Keep license keys private and secure. Never share them publicly.')}
                  </Text>
                </Stack>
              </Alert>
            )}

            <Paper withBorder p="md" radius="md">
              <Stack gap="md">
                <TextInput
                  label={t('admin.settings.premium.key.label', 'License Key')}
                  description={t('admin.settings.premium.key.description', 'Enter your premium or enterprise license key. Premium features will be automatically enabled when a key is provided.')}
                  value={licenseKeyInput}
                  onChange={(e) => setLicenseKeyInput(e.target.value)}
                  placeholder={licenseInfo?.licenseKey || '00000000-0000-0000-0000-000000000000'}
                  type="password"
                  disabled={savingLicense}
                />

                <Group justify="flex-end">
                  <Button onClick={handleSaveLicense} loading={savingLicense} size="sm">
                    {t('admin.settings.save', 'Save Changes')}
                  </Button>
                </Group>
              </Stack>
            </Paper>
          </Stack>
        </Collapse>
      </div>
    </div>
  );
};

export default AdminPlanSection;
