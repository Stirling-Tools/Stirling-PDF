import React, { useState, useCallback, useEffect } from 'react';
import { Divider, Loader, Alert, Select, Group, Text, Collapse, Button, TextInput, Stack, Paper } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { usePlans } from '@app/hooks/usePlans';
import licenseService, { PlanTierGroup } from '@app/services/licenseService';
import StripeCheckout from '@app/components/shared/StripeCheckout';
import AvailablePlansSection from './plan/AvailablePlansSection';
import ActivePlanSection from './plan/ActivePlanSection';
import StaticPlanSection from './plan/StaticPlanSection';
import { userManagementService } from '@app/services/userManagementService';
import { useAppConfig } from '@app/contexts/AppConfigContext';
import { alert } from '@app/components/toast';
import LocalIcon from '@app/components/shared/LocalIcon';
import RestartConfirmationModal from '@app/components/shared/config/RestartConfirmationModal';
import { useRestartServer } from '@app/components/shared/config/useRestartServer';
import { useAdminSettings } from '@app/hooks/useAdminSettings';
import PendingBadge from '@app/components/shared/config/PendingBadge';
import { convertOperationConfig } from '@app/hooks/tools/convert/useConvertOperation';

interface PremiumSettingsData {
  key?: string;
  enabled?: boolean;
}

const AdminPlanSection: React.FC = () => {
  const { t } = useTranslation();
  const { config } = useAppConfig();
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [selectedPlanGroup, setSelectedPlanGroup] = useState<PlanTierGroup | null>(null);
  const [currency, setCurrency] = useState<string>('gbp');
  const [useStaticVersion, setUseStaticVersion] = useState(false);
  const [currentLicenseInfo, setCurrentLicenseInfo] = useState<any>(null);
  const [licenseInfoLoading, setLicenseInfoLoading] = useState(false);
  const [licenseInfoError, setLicenseInfoError] = useState<string | null>(null);
  const [showLicenseKey, setShowLicenseKey] = useState(false);
  const [email, setEmail] = useState<string>('');
  const { plans, currentSubscription, loading, error, refetch } = usePlans(currency);

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
        console.log('Fetching user and license info for plan section');
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

        // Also fetch license info from new backend endpoint
        try {
          setLicenseInfoLoading(true);
          setLicenseInfoError(null);
          const backendLicenseInfo = await licenseService.getLicenseInfo();
          setCurrentLicenseInfo(backendLicenseInfo);
          setLicenseInfoLoading(false);
        } catch (licenseErr: any) {
          console.error('Failed to fetch backend license info:', licenseErr);
          setLicenseInfoLoading(false);
          setLicenseInfoError(licenseErr?.response?.data?.error || licenseErr?.message || 'Unknown error');
          // Don't overwrite existing info if backend call fails
        }
      } catch (err) {
        console.error('Failed to fetch license info:', err);
      }

    };

    // Check if Stripe is configured
    const stripeKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
    if (!stripeKey || error) {
      setUseStaticVersion(true);
    }
    fetchLicenseInfo();

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
      // Validate email is provided
      if (!email || !email.trim()) {
        alert({
          alertType: 'warning',
          title: t('admin.plan.emailRequired.title', 'Email Required'),
          body: t('admin.plan.emailRequired.message', 'Please enter your email address before proceeding'),
        });
        return;
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        alert({
          alertType: 'warning',
          title: t('admin.plan.invalidEmail.title', 'Invalid Email'),
          body: t('admin.plan.invalidEmail.message', 'Please enter a valid email address'),
        });
        return;
      }

      setSelectedPlanGroup(planGroup);
      setCheckoutOpen(true);
    },
    [email, t]
  );

  const handlePaymentSuccess = useCallback(
    (sessionId: string) => {
      console.log('Payment successful, session:', sessionId);

      // Don't refetch here - will refetch when modal closes to avoid re-renders
      // Don't close modal - let user view license key and close manually
      // Modal will show "You can now close this window" when ready
    },
    []
  );

  const handlePaymentError = useCallback((error: string) => {
    console.error('Payment error:', error);
    // Error is already displayed in the StripeCheckout component
  }, []);

  const handleLicenseActivated = useCallback((licenseInfo: {licenseType: string; enabled: boolean; maxUsers: number; hasKey: boolean}) => {
    console.log('License activated:', licenseInfo);
    setCurrentLicenseInfo(licenseInfo);
  }, []);

  const handleCheckoutClose = useCallback(() => {
    setCheckoutOpen(false);
    setSelectedPlanGroup(null);

    // Refetch plans after modal closes to update subscription display
    refetch();
  }, [refetch]);

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

  if (!plans || plans.length === 0) {
    return (
      <Alert color="yellow" title="No data available">
        Plans data is not available at the moment.
      </Alert>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* License Information Display - Always visible */}
      <Alert
        color={licenseInfoLoading ? "gray" : licenseInfoError ? "red" : currentLicenseInfo?.enabled ? "green" : "blue"}
        title={t('admin.plan.licenseInfo', 'License Information')}
      >
        {licenseInfoLoading ? (
          <Group gap="xs">
            <Loader size="sm" />
            <Text size="sm">{t('admin.plan.loadingLicense', 'Loading license information...')}</Text>
          </Group>
        ) : licenseInfoError ? (
          <Text size="sm" c="red">{t('admin.plan.licenseError', 'Failed to load license info')}: {licenseInfoError}</Text>
        ) : currentLicenseInfo ? (
          <Stack gap="xs">
            <Text size="sm">
              <strong>{t('admin.plan.licenseType', 'License Type')}:</strong> {currentLicenseInfo.licenseType}
            </Text>
            <Text size="sm">
              <strong>{t('admin.plan.status', 'Status')}:</strong> {currentLicenseInfo.enabled ? t('admin.plan.active', 'Active') : t('admin.plan.inactive', 'Inactive')}
            </Text>
            {currentLicenseInfo.licenseType === 'ENTERPRISE' && currentLicenseInfo.maxUsers > 0 && (
              <Text size="sm">
                <strong>{t('admin.plan.maxUsers', 'Max Users')}:</strong> {currentLicenseInfo.maxUsers}
              </Text>
            )}
          </Stack>
        ) : (
          <Text size="sm">{t('admin.plan.noLicenseInfo', 'No license information available')}</Text>
        )}
      </Alert>

      {/* Customer Information Section */}
      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <Text size="lg" fw={600}>
            {t('admin.plan.customerInfo', 'Customer Information')}
          </Text>
          <TextInput
            label={t('admin.plan.email.label', 'Email Address')}
            description={t('admin.plan.email.description', 'This email will be used to manage your subscription and billing')}
            placeholder="admin@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            type="email"
          />
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
            />
          </Group>
        </Stack>
      </Paper>

      {currentSubscription && (
        <>
          <ActivePlanSection subscription={currentSubscription} />
          <Divider />
        </>
      )}

      <AvailablePlansSection
        plans={plans}
        currentPlanId={currentSubscription?.plan.id}
        onUpgradeClick={handleUpgradeClick}
      />

      {/* Stripe Checkout Modal */}
      {selectedPlanGroup && (
        <StripeCheckout
          opened={checkoutOpen}
          onClose={handleCheckoutClose}
          planGroup={selectedPlanGroup}
          email={email}
          onSuccess={handlePaymentSuccess}
          onError={handlePaymentError}
          onLicenseActivated={handleLicenseActivated}
        />
      )}

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
