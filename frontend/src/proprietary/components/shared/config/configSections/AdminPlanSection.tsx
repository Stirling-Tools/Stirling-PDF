import React, { useState, useCallback, useEffect } from 'react';
import { Divider, Loader, Alert, Select, Group, Text, Collapse, Button, TextInput, Stack, Paper } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { usePlans } from '@app/hooks/usePlans';
import licenseService, { PlanTierGroup } from '@app/services/licenseService';
import { useCheckout } from '@app/contexts/CheckoutContext';
import { useLicense } from '@app/contexts/LicenseContext';
import AvailablePlansSection from '@app/components/shared/config/configSections/plan/AvailablePlansSection';
import StaticPlanSection from '@app/components/shared/config/configSections/plan/StaticPlanSection';
import { alert } from '@app/components/toast';
import LocalIcon from '@app/components/shared/LocalIcon';
import { Z_INDEX_OVER_CONFIG_MODAL } from '@app/styles/zIndex';
import { ManageBillingButton } from '@app/components/shared/ManageBillingButton';
import { isSupabaseConfigured } from '@app/services/supabaseClient';

const AdminPlanSection: React.FC = () => {
  const { t } = useTranslation();
  const { openCheckout } = useCheckout();
  const { licenseInfo, refetchLicense } = useLicense();
  const [currency, setCurrency] = useState<string>('gbp');
  const [useStaticVersion, setUseStaticVersion] = useState(false);
  const [showLicenseKey, setShowLicenseKey] = useState(false);
  const [licenseKeyInput, setLicenseKeyInput] = useState<string>('');
  const [savingLicense, setSavingLicense] = useState(false);
  const { plans, loading, error, refetch } = usePlans(currency);

  // Check if we should use static version
  useEffect(() => {
    // Check if Stripe and Supabase are configured
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

  const handleUpgradeClick = useCallback(
    (planGroup: PlanTierGroup) => {
      // Only allow upgrades for server and enterprise tiers
      if (planGroup.tier === 'free') {
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
    [openCheckout, currency, refetch]
  );

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
      {/* Currency Selection & Manage Subscription */}
      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <Group justify="space-between" align="center">
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
              comboboxProps={{ withinPortal: true, zIndex: Z_INDEX_OVER_CONFIG_MODAL }}
            />
          </Group>

          {/* Manage Subscription Button - Only show if user has active license and Supabase is configured */}
          {licenseInfo?.licenseKey && isSupabaseConfigured && (
            <Group justify="space-between" align="center">
              <Text size="sm" c="dimmed">
                {t('plan.manageSubscription.description', 'Manage your subscription, billing, and payment methods')}
              </Text>
              <ManageBillingButton />
            </Group>
          )}
        </Stack>
      </Paper>

      <AvailablePlansSection
        plans={plans}
        currentLicenseInfo={licenseInfo}
        onUpgradeClick={handleUpgradeClick}
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
