import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Button, Text, Alert, Loader, Stack, Group, Paper, SegmentedControl, Grid, Code } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { loadStripe } from '@stripe/stripe-js';
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from '@stripe/react-stripe-js';
import licenseService, { PlanTierGroup } from '@app/services/licenseService';
import { Z_INDEX_OVER_CONFIG_MODAL } from '@app/styles/zIndex';
import { pollLicenseKeyWithBackoff, activateLicenseKey } from '@app/utils/licenseCheckoutUtils';

// Validate Stripe key (static validation, no dynamic imports)
const STRIPE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;

if (!STRIPE_KEY) {
  console.error(
    'VITE_STRIPE_PUBLISHABLE_KEY environment variable is required. ' +
    'Please add it to your .env file. ' +
    'Get your key from https://dashboard.stripe.com/apikeys'
  );
}

if (STRIPE_KEY && !STRIPE_KEY.startsWith('pk_')) {
  console.error(
    `Invalid Stripe publishable key format. ` +
    `Expected key starting with 'pk_', got: ${STRIPE_KEY.substring(0, 10)}...`
  );
}

const stripePromise = STRIPE_KEY ? loadStripe(STRIPE_KEY) : null;

interface StripeCheckoutProps {
  opened: boolean;
  onClose: () => void;
  planGroup: PlanTierGroup;
  minimumSeats?: number;
  onSuccess?: (sessionId: string) => void;
  onError?: (error: string) => void;
  onLicenseActivated?: (licenseInfo: {licenseType: string; enabled: boolean; maxUsers: number; hasKey: boolean}) => void;
}

type CheckoutState = {
  status: 'idle' | 'loading' | 'ready' | 'success' | 'error';
  clientSecret?: string;
  error?: string;
  sessionId?: string;
};

const StripeCheckout: React.FC<StripeCheckoutProps> = ({
  opened,
  onClose,
  planGroup,
  minimumSeats = 1,
  onSuccess,
  onError,
  onLicenseActivated,
}) => {
  const { t } = useTranslation();
  const [state, setState] = useState<CheckoutState>({ status: 'idle' });
  // Default to yearly if available (better value), otherwise monthly
  const [selectedPeriod, setSelectedPeriod] = useState<'monthly' | 'yearly'>(
    planGroup.yearly ? 'yearly' : 'monthly'
  );
  const [installationId, setInstallationId] = useState<string | null>(null);
  const [currentLicenseKey, setCurrentLicenseKey] = useState<string | null>(null);
  const [licenseKey, setLicenseKey] = useState<string | null>(null);
  const [pollingStatus, setPollingStatus] = useState<'idle' | 'polling' | 'ready' | 'timeout'>('idle');

  // Refs for polling cleanup
  const isMountedRef = React.useRef(true);
  const pollingTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  // Get the selected plan based on period
  const selectedPlan = selectedPeriod === 'yearly' ? planGroup.yearly : planGroup.monthly;

  const createCheckoutSession = async () => {
    if (!selectedPlan) {
      setState({
        status: 'error',
        error: 'Selected plan period is not available',
      });
      return;
    }

    try {
      setState({ status: 'loading' });

      // Fetch installation ID from backend
      let fetchedInstallationId = installationId;
      if (!fetchedInstallationId) {
        fetchedInstallationId = await licenseService.getInstallationId();
        setInstallationId(fetchedInstallationId);
      }

      // Fetch current license key for upgrades
      let existingLicenseKey: string | undefined;
      try {
        const licenseInfo = await licenseService.getLicenseInfo();
        if (licenseInfo && licenseInfo.licenseKey) {
          existingLicenseKey = licenseInfo.licenseKey;
          setCurrentLicenseKey(existingLicenseKey);
          console.log('Found existing license for upgrade');
        }
      } catch (error) {
        console.warn('Could not fetch license info, proceeding as new license:', error);
      }

      const response = await licenseService.createCheckoutSession({
        lookup_key: selectedPlan.lookupKey,
        installation_id: fetchedInstallationId,
        current_license_key: existingLicenseKey,
        requires_seats: selectedPlan.requiresSeats,
        seat_count: Math.max(1, Math.min(minimumSeats || 1, 10000)),
      });

      // Check if we got a redirect URL (hosted checkout for HTTP)
      if (response.url) {
        console.log('Redirecting to Stripe hosted checkout:', response.url);
        // Redirect to Stripe's hosted checkout page
        window.location.href = response.url;
        return;
      }

      // Otherwise, use embedded checkout (HTTPS)
      setState({
        status: 'ready',
        clientSecret: response.clientSecret,
        sessionId: response.sessionId,
      });
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to create checkout session';
      setState({
        status: 'error',
        error: errorMessage,
      });
      onError?.(errorMessage);
    }
  };

  const pollForLicenseKey = useCallback(async (installId: string) => {
    // Use shared polling utility
    const result = await pollLicenseKeyWithBackoff(installId, {
      isMounted: () => isMountedRef.current,
      onStatusChange: setPollingStatus,
    });

    if (result.success && result.licenseKey) {
      setLicenseKey(result.licenseKey);

      // Activate the license key
      const activation = await activateLicenseKey(result.licenseKey, {
        isMounted: () => isMountedRef.current,
        onActivated: onLicenseActivated,
      });

      if (!activation.success) {
        console.error('Failed to activate license key:', activation.error);
      }
    } else if (result.timedOut) {
      console.warn('License key polling timed out');
    } else if (result.error) {
      console.error('License key polling failed:', result.error);
    }
  }, [onLicenseActivated]);

  const handlePaymentComplete = async () => {
    // Preserve state when changing status
    setState(prev => ({ ...prev, status: 'success' }));

    // Check if this is an upgrade (existing license key) or new plan
    if (currentLicenseKey) {
      // UPGRADE FLOW: Force license re-verification by saving existing key
      console.log('Upgrade detected - syncing existing license key');
      setPollingStatus('polling');

      const activation = await activateLicenseKey(currentLicenseKey, {
        isMounted: () => true, // Modal is open, no need to check
        onActivated: onLicenseActivated,
      });

      if (activation.success) {
        console.log(`License upgraded successfully: ${activation.licenseType}`);
        setPollingStatus('ready');
      } else {
        console.error('Failed to sync upgraded license:', activation.error);
        setPollingStatus('timeout');
      }

      // Notify parent (don't wait - upgrade is complete)
      onSuccess?.(state.sessionId || '');
    } else {
      // NEW PLAN FLOW: Poll for new license key
      console.log('New subscription - polling for license key');

      if (installationId) {
        pollForLicenseKey(installationId).finally(() => {
          // Only notify parent after polling completes or times out
          onSuccess?.(state.sessionId || '');
        });
      } else {
        // No installation ID, notify immediately
        onSuccess?.(state.sessionId || '');
      }
    }
  };

  const handleClose = () => {
    // Clear any active polling
    if (pollingTimeoutRef.current) {
      clearTimeout(pollingTimeoutRef.current);
      pollingTimeoutRef.current = null;
    }

    setState({ status: 'idle' });
    setPollingStatus('idle');
    setCurrentLicenseKey(null);
    setLicenseKey(null);
    // Reset to default period on close
    setSelectedPeriod(planGroup.yearly ? 'yearly' : 'monthly');
    onClose();
  };

  const handlePeriodChange = (value: string) => {
    setSelectedPeriod(value as 'monthly' | 'yearly');
    // Reset state to trigger checkout reload
    setState({ status: 'idle' });
  };

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      if (pollingTimeoutRef.current) {
        clearTimeout(pollingTimeoutRef.current);
        pollingTimeoutRef.current = null;
      }
    };
  }, []);

  // Initialize checkout when modal opens or period changes
  useEffect(() => {
    // Don't reset if we're showing success state (license key)
    if (state.status === 'success') {
      return;
    }

    if (opened && state.status === 'idle') {
      createCheckoutSession();
    } else if (!opened) {
      setState({ status: 'idle' });
    }
  }, [opened, selectedPeriod, state.status]);

  const renderContent = () => {
    // Check if Stripe is configured
    if (!stripePromise) {
      return (
        <Alert color="red" title={t('payment.stripeNotConfigured', 'Stripe Not Configured')}>
          <Stack gap="md">
            <Text size="sm">
              {t(
                'payment.stripeNotConfiguredMessage',
                'Stripe payment integration is not configured. Please contact your administrator.'
              )}
            </Text>
            <Button variant="outline" onClick={handleClose}>
              {t('common.close', 'Close')}
            </Button>
          </Stack>
        </Alert>
      );
    }

    switch (state.status) {
      case 'loading':
        return (
          <Stack align="center" justify="center" style={{ padding: '2rem 0' }}>
            <Loader size="lg" />
            <Text size="sm" c="dimmed" mt="md">
              {t('payment.preparing', 'Preparing your checkout...')}
            </Text>
          </Stack>
        );

      case 'ready':
        {
        if (!state.clientSecret || !selectedPlan) return null;

        // Build period selector data with prices
        const periodData = [];
        if (planGroup.monthly) {
          const monthlyPrice = planGroup.monthly.requiresSeats && planGroup.monthly.seatPrice
            ? `${planGroup.monthly.currency}${planGroup.monthly.price.toFixed(2)}${planGroup.monthly.period} + ${planGroup.monthly.currency}${planGroup.monthly.seatPrice.toFixed(2)}/seat`
            : `${planGroup.monthly.currency}${planGroup.monthly.price.toFixed(2)}${planGroup.monthly.period}`;

          periodData.push({
            value: 'monthly',
            label: `${t('payment.monthly', 'Monthly')} - ${monthlyPrice}`,
          });
        }
        if (planGroup.yearly) {
          const yearlyPrice = planGroup.yearly.requiresSeats && planGroup.yearly.seatPrice
            ? `${planGroup.yearly.currency}${planGroup.yearly.price.toFixed(2)}${planGroup.yearly.period} + ${planGroup.yearly.currency}${planGroup.yearly.seatPrice.toFixed(2)}/seat`
            : `${planGroup.yearly.currency}${planGroup.yearly.price.toFixed(2)}${planGroup.yearly.period}`;

          periodData.push({
            value: 'yearly',
            label: `${t('payment.yearly', 'Yearly')} - ${yearlyPrice}`,
          });
        }

        return (
          <Grid gutter="md">
            {/* Left: Period Selector - only show if both periods available */}
            {periodData.length > 1 && (
              <Grid.Col span={3}>
                <Stack gap="sm" style={{ height: '100%' }}>
                  <Text size="sm" fw={600}>
                    {t('payment.billingPeriod', 'Billing Period')}
                  </Text>
                  <SegmentedControl
                    value={selectedPeriod}
                    onChange={handlePeriodChange}
                    data={periodData}
                    orientation="vertical"
                    fullWidth
                  />
                  {selectedPlan.requiresSeats && selectedPlan.seatPrice && (
                    <Text size="xs" c="dimmed" mt="md">
                      {t('payment.enterpriseNote', 'Seats can be adjusted in checkout (1-1000).')}
                    </Text>
                  )}
                </Stack>
              </Grid.Col>
            )}

            {/* Right: Stripe Checkout */}
            <Grid.Col span={periodData.length > 1 ? 9 : 12}>
              <EmbeddedCheckoutProvider
                key={state.clientSecret}
                stripe={stripePromise}
                options={{
                  clientSecret: state.clientSecret,
                  onComplete: handlePaymentComplete,
                }}
              >
                <EmbeddedCheckout />
              </EmbeddedCheckoutProvider>
            </Grid.Col>
          </Grid>
        );
      }
      case 'success':
        return (
          <Alert color="green" title={t('payment.success', 'Payment Successful!')}>
            <Stack gap="md">
              <Text size="sm">
                {t(
                  'payment.successMessage',
                  'Your subscription has been activated successfully.'
                )}
              </Text>

              {/* License Key Polling Status */}
              {pollingStatus === 'polling' && (
                <Group gap="xs">
                  <Loader size="sm" />
                  <Text size="sm" c="dimmed">
                    {currentLicenseKey
                      ? t('payment.syncingLicense', 'Syncing your upgraded license...')
                      : t('payment.generatingLicense', 'Generating your license key...')}
                  </Text>
                </Group>
              )}

              {pollingStatus === 'ready' && !currentLicenseKey && licenseKey && (
                <Paper withBorder p="md" radius="md" bg="gray.1">
                  <Stack gap="sm">
                    <Text size="sm" fw={600}>
                      {t('payment.licenseKey', 'Your License Key')}
                    </Text>
                    <Code block>{licenseKey}</Code>
                    <Button
                      variant="light"
                      size="sm"
                      onClick={() => navigator.clipboard.writeText(licenseKey)}
                    >
                      {t('common.copy', 'Copy to Clipboard')}
                    </Button>
                    <Text size="xs" c="dimmed">
                      {t(
                        'payment.licenseInstructions',
                        'Enter this key in Settings → Admin Plan → License Key section'
                      )}
                    </Text>
                  </Stack>
                </Paper>
              )}

              {pollingStatus === 'ready' && currentLicenseKey && (
                <Alert color="green" title={t('payment.upgradeComplete', 'Upgrade Complete')}>
                  <Text size="sm">
                    {t(
                      'payment.upgradeCompleteMessage',
                      'Your subscription has been upgraded successfully. Your existing license key has been updated.'
                    )}
                  </Text>
                </Alert>
              )}

              {pollingStatus === 'timeout' && (
                <Alert color="yellow" title={t('payment.licenseDelayed', 'License Key Processing')}>
                  <Text size="sm">
                    {t(
                      'payment.licenseDelayedMessage',
                      'Your license key is being generated. Please check your email shortly or contact support.'
                    )}
                  </Text>
                </Alert>
              )}

              {pollingStatus === 'ready' && (
                <Text size="xs" c="dimmed">
                  {t('payment.canCloseWindow', 'You can now close this window.')}
                </Text>
              )}
            </Stack>
          </Alert>
        );

      case 'error':
        return (
          <Alert color="red" title={t('payment.error', 'Payment Error')}>
            <Stack gap="md">
              <Text size="sm">{state.error}</Text>
              <Button variant="outline" onClick={handleClose}>
                {t('common.close', 'Close')}
              </Button>
            </Stack>
          </Alert>
        );

      default:
        return null;
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={
        <Text fw={600} size="lg">
          {t('payment.upgradeTitle', 'Upgrade to {{planName}}', { planName: planGroup.name })}
        </Text>
      }
      size="90%"
      centered
      withCloseButton={true}
      closeOnEscape={true}
      closeOnClickOutside={false}
      zIndex={Z_INDEX_OVER_CONFIG_MODAL}
      styles={{
        body: {
          minHeight: '85vh',
        },
        content: {
          maxHeight: '95vh',
        },
      }}
    >
      {renderContent()}
    </Modal>
  );
};

export default StripeCheckout;
