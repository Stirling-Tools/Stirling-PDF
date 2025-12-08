import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Divider, Loader, Alert, Group, Text, Collapse, Button, TextInput, Stack, Paper, SegmentedControl, FileButton } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { usePlans } from '@app/hooks/usePlans';
import licenseService, { PlanTierGroup, mapLicenseToTier } from '@app/services/licenseService';
import { useCheckout } from '@app/contexts/CheckoutContext';
import { useLicense } from '@app/contexts/LicenseContext';
import AvailablePlansSection from '@app/components/shared/config/configSections/plan/AvailablePlansSection';
import StaticPlanSection from '@app/components/shared/config/configSections/plan/StaticPlanSection';
import { alert } from '@app/components/toast';
import LocalIcon from '@app/components/shared/LocalIcon';
import { InfoBanner } from '@app/components/shared/InfoBanner';
import { useLicenseAlert } from '@app/hooks/useLicenseAlert';
import { isSupabaseConfigured } from '@app/services/supabaseClient';
import { getPreferredCurrency, setCachedCurrency } from '@app/utils/currencyDetection';
import { useLoginRequired } from '@app/hooks/useLoginRequired';
import LoginRequiredBanner from '@core/components/shared/config/LoginRequiredBanner';

const AdminPlanSection: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { loginEnabled, validateLoginEnabled } = useLoginRequired();
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
  const [inputMethod, setInputMethod] = useState<'text' | 'file'>('text');
  const [licenseFile, setLicenseFile] = useState<File | null>(null);
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

  const handleSaveLicense = async () => {
    // Block save if login is disabled
    if (!validateLoginEnabled()) {
      return;
    }

    try {
      setSavingLicense(true);

      let response;

      if (inputMethod === 'file' && licenseFile) {
        // Upload file
        response = await licenseService.saveLicenseFile(licenseFile);
      } else if (inputMethod === 'text' && licenseKeyInput.trim()) {
        // Save key string (allow empty string to clear/remove license)
        response = await licenseService.saveLicenseKey(licenseKeyInput.trim());
      } else {
        alert({
          alertType: 'error',
          title: t('admin.error', 'Error'),
          body: t('admin.settings.premium.noInput', 'Please provide a license key or file'),
        });
        return;
      }

      if (response.success) {
        // Refresh license context to update all components
        await refetchLicense();

        const successMessage = inputMethod === 'file'
          ? t('admin.settings.premium.file.successMessage', 'License file uploaded and activated successfully')
          : t('admin.settings.premium.key.successMessage', 'License key activated successfully');

        alert({
          alertType: 'success',
          title: t('success', 'Success'),
          body: successMessage,
        });

        // Clear inputs
        setLicenseKeyInput('');
        setLicenseFile(null);
        setInputMethod('text'); // Reset to default
      } else {
        alert({
          alertType: 'error',
          title: t('admin.error', 'Error'),
          body: response.error || t('admin.settings.saveError', 'Failed to save license'),
        });
      }
    } catch (error) {
      console.error('Failed to save license:', error);
      alert({
        alertType: 'error',
        title: t('admin.error', 'Error'),
        body: t('admin.settings.saveError', 'Failed to save license'),
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

            {/* Show current license source */}
            {licenseInfo?.licenseKey && (
              <Alert
                variant="light"
                color="green"
                icon={<LocalIcon icon="check-circle-rounded" width="1rem" height="1rem" />}
              >
                <Stack gap="xs">
                  <Text size="sm" fw={500}>
                    {t('admin.settings.premium.currentLicense.title', 'Active License')}
                  </Text>
                  <Text size="xs">
                    {licenseInfo.licenseKey.startsWith('file:')
                      ? t('admin.settings.premium.currentLicense.file', 'Source: License file ({{path}})', {
                          path: licenseInfo.licenseKey.substring(5)
                        })
                      : t('admin.settings.premium.currentLicense.key', 'Source: License key')}
                  </Text>
                  <Text size="xs">
                    {t('admin.settings.premium.currentLicense.type', 'Type: {{type}}', {
                      type: licenseInfo.licenseType
                    })}
                  </Text>
                </Stack>
              </Alert>
            )}

            {/* Input method selector */}
            <SegmentedControl
              value={inputMethod}
              onChange={(value) => {
                setInputMethod(value as 'text' | 'file');
                // Clear opposite input when switching
                if (value === 'text') setLicenseFile(null);
                if (value === 'file') setLicenseKeyInput('');
              }}
              data={[
                {
                  label: t('admin.settings.premium.inputMethod.text', 'License Key'),
                  value: 'text'
                },
                {
                  label: t('admin.settings.premium.inputMethod.file', 'Certificate File'),
                  value: 'file'
                }
              ]}
              disabled={!loginEnabled || savingLicense}
            />

            {/* Input area */}
            <Paper withBorder p="md" radius="md">
              <Stack gap="md">
                {inputMethod === 'text' ? (
                  /* Existing text input */
                  <TextInput
                    label={t('admin.settings.premium.key.label', 'License Key')}
                    description={t('admin.settings.premium.key.description', 'Enter your premium or enterprise license key. Premium features will be automatically enabled when a key is provided.')}
                    value={licenseKeyInput}
                    onChange={(e) => setLicenseKeyInput(e.target.value)}
                    placeholder={licenseInfo?.licenseKey || '00000000-0000-0000-0000-000000000000'}
                    type="password"
                    disabled={!loginEnabled || savingLicense}
                  />
                ) : (
                  /* File upload */
                  <div>
                    <Text size="sm" fw={500} mb="xs">
                      {t('admin.settings.premium.file.label', 'License Certificate File')}
                    </Text>
                    <Text size="xs" c="dimmed" mb="md">
                      {t('admin.settings.premium.file.description', 'Upload your .lic or .cert license file')}
                    </Text>
                    <FileButton
                      onChange={setLicenseFile}
                      accept=".lic,.cert"
                      disabled={!loginEnabled || savingLicense}
                    >
                      {(props) => (
                        <Button
                          {...props}
                          variant="outline"
                          leftSection={<LocalIcon icon="upload-file-rounded" width="1rem" height="1rem" />}
                          disabled={!loginEnabled || savingLicense}
                        >
                          {licenseFile
                            ? licenseFile.name
                            : t('admin.settings.premium.file.choose', 'Choose License File')}
                        </Button>
                      )}
                    </FileButton>
                    {licenseFile && (
                      <Text size="xs" c="dimmed" mt="xs">
                        {t('admin.settings.premium.file.selected', 'Selected: {{filename}} ({{size}})', {
                          filename: licenseFile.name,
                          size: (licenseFile.size / 1024).toFixed(2) + ' KB'
                        })}
                      </Text>
                    )}
                  </div>
                )}

                <Group justify="flex-end">
                  <Button
                    onClick={handleSaveLicense}
                    loading={savingLicense}
                    size="sm"
                    disabled={
                      !loginEnabled ||
                      (inputMethod === 'text' && !licenseKeyInput.trim()) ||
                      (inputMethod === 'file' && !licenseFile)
                    }
                  >
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
