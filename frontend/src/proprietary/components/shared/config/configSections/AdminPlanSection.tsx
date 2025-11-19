import React, { useState, useCallback, useEffect } from 'react';
import { Divider, Loader, Alert, Select, Group, Text, Collapse, Button, TextInput, Stack, Paper } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { usePlans } from '@app/hooks/usePlans';
import licenseService, { PlanTierGroup, LicenseInfo } from '@app/services/licenseService';
import { useCheckout } from '@app/contexts/CheckoutContext';
import AvailablePlansSection from '@app/components/shared/config/configSections/plan/AvailablePlansSection';
import StaticPlanSection from '@app/components/shared/config/configSections/plan/StaticPlanSection';
import { useAppConfig } from '@app/contexts/AppConfigContext';
import { alert } from '@app/components/toast';
import LocalIcon from '@app/components/shared/LocalIcon';
import RestartConfirmationModal from '@app/components/shared/config/RestartConfirmationModal';
import { useRestartServer } from '@app/components/shared/config/useRestartServer';
import { useAdminSettings } from '@app/hooks/useAdminSettings';
import PendingBadge from '@app/components/shared/config/PendingBadge';
import { Z_INDEX_OVER_CONFIG_MODAL } from '@app/styles/zIndex';
import { ManageBillingButton } from '@app/components/shared/ManageBillingButton';
import { pollLicenseKeyWithBackoff, activateLicenseKey } from '@app/utils/licenseCheckoutUtils';

interface PremiumSettingsData {
  key?: string;
  enabled?: boolean;
}

const AdminPlanSection: React.FC = () => {
  const { t } = useTranslation();
  const { config } = useAppConfig();
  const { openCheckout } = useCheckout();
  const [currency, setCurrency] = useState<string>('gbp');
  const [useStaticVersion, setUseStaticVersion] = useState(false);
  const [currentLicenseInfo, setCurrentLicenseInfo] = useState<LicenseInfo | null>(null);
  const [showLicenseKey, setShowLicenseKey] = useState(false);
  const { plans, loading, error, refetch } = usePlans(currency);

  // Premium/License key management
  const { restartModalOpened, showRestartModal, closeRestartModal, restartServer } = useRestartServer();
  const {
    settings: premiumSettings,
    setSettings: setPremiumSettings,
    loading: premiumLoading,
    saving: premiumSaving,
    fetchSettings: fetchPremiumSettings,
    saveSettings: savePremiumSettings,
    isFieldPending,
  } = useAdminSettings<PremiumSettingsData>({
    sectionName: 'premium',
  });

  // Check if we should use static version and fetch license info
  useEffect(() => {
    const fetchLicenseInfo = async () => {
      try {
        // Fetch license info from backend endpoint
        try {
          const backendLicenseInfo = await licenseService.getLicenseInfo();
          setCurrentLicenseInfo(backendLicenseInfo);
        } catch (licenseErr: any) {
          console.error('Failed to fetch backend license info:', licenseErr);
        }
      } catch (err) {
        console.error('Failed to fetch license info:', err);
      }
    };

    // Handle return from hosted Stripe checkout
    const handleCheckoutReturn = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const paymentStatus = urlParams.get('payment_status');
      const sessionId = urlParams.get('session_id');

      if (paymentStatus === 'success' && sessionId) {
        console.log('Payment successful via hosted checkout:', sessionId);

        // Clear URL parameters
        window.history.replaceState({}, '', window.location.pathname);

        // Check if this is an upgrade or new subscription
        if (currentLicenseInfo?.licenseKey) {
          // UPGRADE: Sync existing license key
          console.log('Upgrade detected - syncing existing license');

          const activation = await activateLicenseKey(currentLicenseInfo.licenseKey, {
            onActivated: fetchLicenseInfo,
          });

          if (activation.success) {
            alert({
              message: t('payment.upgradeSuccess', 'Your subscription has been upgraded successfully!'),
              color: 'green',
            });
          } else {
            console.error('Failed to sync license after upgrade:', activation.error);
            alert({
              message: t('payment.syncError', 'Payment successful but license sync failed. Please contact support.'),
              color: 'red',
            });
          }
        } else {
          // NEW SUBSCRIPTION: Poll for license key
          console.log('New subscription - polling for license key');
          alert({
            message: t('payment.paymentSuccess', 'Payment successful! Retrieving your license key...'),
            color: 'green',
          });

          try {
            const installationId = await licenseService.getInstallationId();
            console.log('Polling for license key with installation ID:', installationId);

            // Use shared polling utility
            const result = await pollLicenseKeyWithBackoff(installationId);

            if (result.success && result.licenseKey) {
              // Activate the license key
              const activation = await activateLicenseKey(result.licenseKey, {
                onActivated: fetchLicenseInfo,
              });

              if (activation.success) {
                console.log(`License key activated: ${activation.licenseType}`);
                alert({
                  message: t('payment.licenseActivated', 'License key activated successfully!'),
                  color: 'green',
                });
              } else {
                console.error('Failed to save license key:', activation.error);
                alert({
                  message: t('payment.licenseSaveError', 'Failed to save license key. Please contact support.'),
                  color: 'red',
                });
              }
            } else if (result.timedOut) {
              console.warn('License key polling timed out');
              alert({
                message: t('payment.licenseDelayed', 'License key is being generated. Please check back shortly or contact support.'),
                color: 'yellow',
              });
            } else {
              console.error('License key polling failed:', result.error);
              alert({
                message: t('payment.licensePollingError', 'Failed to retrieve license key. Please check your email or contact support.'),
                color: 'red',
              });
            }
          } catch (error) {
            console.error('Failed to poll for license key:', error);
            alert({
              message: t('payment.licenseRetrievalError', 'Failed to retrieve license key. Please check your email or contact support.'),
              color: 'red',
            });
          }
        }
      } else if (paymentStatus === 'canceled') {
        console.log('Payment canceled by user');

        // Clear URL parameters
        window.history.replaceState({}, '', window.location.pathname);

        alert({
          message: t('payment.paymentCanceled', 'Payment was canceled.'),
          color: 'yellow',
        });
      }
    };

    // Check if Stripe is configured
    const stripeKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
    if (!stripeKey || error) {
      setUseStaticVersion(true);
    }
    fetchLicenseInfo();

    // Handle checkout return after license info is loaded
    handleCheckoutReturn();

    // Fetch premium settings
    fetchPremiumSettings();
  }, [error, config]);

  const handleSaveLicense = async () => {
    try {
      await savePremiumSettings();
      showRestartModal();
    } catch (_error) {
      alert({
        alertType: 'error',
        title: t('admin.error', 'Error'),
        body: t('admin.settings.saveError', 'Failed to save settings'),
      });
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
          // Refetch plans and license info after successful payment
          refetch();
          const fetchLicenseInfo = async () => {
            try {
              const backendLicenseInfo = await licenseService.getLicenseInfo();
              setCurrentLicenseInfo(backendLicenseInfo);
            } catch (err) {
              console.error('Failed to refetch license info:', err);
            }
          };
          fetchLicenseInfo();
        },
      });
    },
    [openCheckout, currency, refetch]
  );

  // Show static version if Stripe is not configured or there's an error
  if (useStaticVersion) {
    return <StaticPlanSection currentLicenseInfo={currentLicenseInfo ?? undefined} />;
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
    return <StaticPlanSection currentLicenseInfo={currentLicenseInfo ?? undefined} />;
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

          {/* Manage Subscription Button - Only show if user has active license */}
          {currentLicenseInfo?.licenseKey && (
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
        currentLicenseInfo={currentLicenseInfo}
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

            {premiumLoading ? (
              <Stack align="center" justify="center" h={100}>
                <Loader size="md" />
              </Stack>
            ) : (
              <Paper withBorder p="md" radius="md">
                <Stack gap="md">
                  <div>
                    <TextInput
                      label={
                        <Group gap="xs">
                          <span>{t('admin.settings.premium.key.label', 'License Key')}</span>
                          <PendingBadge show={isFieldPending('key')} />
                        </Group>
                      }
                      description={t('admin.settings.premium.key.description', 'Enter your premium or enterprise license key. Premium features will be automatically enabled when a key is provided.')}
                      value={premiumSettings.key || ''}
                      onChange={(e) => setPremiumSettings({ ...premiumSettings, key: e.target.value })}
                      placeholder="00000000-0000-0000-0000-000000000000"
                    />
                  </div>

                  <Group justify="flex-end">
                    <Button onClick={handleSaveLicense} loading={premiumSaving} size="sm">
                      {t('admin.settings.save', 'Save Changes')}
                    </Button>
                  </Group>
                </Stack>
              </Paper>
            )}
          </Stack>
        </Collapse>
      </div>

      {/* Restart Confirmation Modal */}
      <RestartConfirmationModal
        opened={restartModalOpened}
        onClose={closeRestartModal}
        onRestart={restartServer}
      />
    </div>
  );
};

export default AdminPlanSection;
