import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Button, Text, Alert, Loader, Stack, Group, Paper, SegmentedControl, Grid, Code } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { loadStripe } from '@stripe/stripe-js';
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from '@stripe/react-stripe-js';
import licenseService, { PlanTierGroup } from '@app/services/licenseService';
import { Z_INDEX_OVER_CONFIG_MODAL } from '@app/styles/zIndex';

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
      let currentLicenseKey: string | undefined;
      try {
        const licenseInfo = await licenseService.getLicenseInfo();
        if (licenseInfo && licenseInfo.licenseKey) {
          currentLicenseKey = licenseInfo.licenseKey;
          console.log('Found existing license for upgrade');
        }
      } catch (error) {
        console.warn('Could not fetch license info, proceeding as new license:', error);
      }

      const response = await licenseService.createCheckoutSession({
        lookup_key: selectedPlan.lookupKey,
        installation_id: fetchedInstallationId,
        current_license_key: currentLicenseKey,
        requires_seats: selectedPlan.requiresSeats,
        seat_count: Math.max(1, Math.min(minimumSeats || 1, 10000)),
        successUrl: `${window.location.origin}/settings/adminPlan?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${window.location.origin}/settings/adminPlan`,
      });

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
    // Exponential backoff: 1s → 2s → 4s → 8s → 16s (31 seconds total, 5 requests)
    const BACKOFF_MS = [1000, 2000, 4000, 8000, 16000];
    let attemptIndex = 0;

    setPollingStatus('polling');
    console.log(`Starting license key polling for installation: ${installId}`);

    const poll = async (): Promise<void> => {
      // Check if component is still mounted
      if (!isMountedRef.current) {
        console.log('Polling cancelled: component unmounted');
        return;
      }

      const attemptNumber = attemptIndex + 1;
      console.log(`Polling attempt ${attemptNumber}/${BACKOFF_MS.length}`);

      try {
        const response = await licenseService.checkLicenseKey(installId);

        // Check mounted after async operation
        if (!isMountedRef.current) return;

        if (response.status === 'ready' && response.license_key) {
          console.log('✅ License key ready!');
          setLicenseKey(response.license_key);
          setPollingStatus('ready');

          // Save license key to backend
          try {
            const saveResponse = await licenseService.saveLicenseKey(response.license_key);
            if (!isMountedRef.current) return;

            if (saveResponse.success) {
              console.log(`License key activated on backend: ${saveResponse.licenseType}`);

              // Fetch and pass license info to parent
              try {
                const licenseInfo = await licenseService.getLicenseInfo();
                if (!isMountedRef.current) return;
                onLicenseActivated?.(licenseInfo);
              } catch (infoError) {
                console.error('Error fetching license info:', infoError);
              }
            } else {
              console.error('Failed to save license key to backend:', saveResponse.error);
            }
          } catch (error) {
            console.error('Error saving license key to backend:', error);
          }

          return;
        }

        // License not ready yet, continue polling
        attemptIndex++;

        if (attemptIndex >= BACKOFF_MS.length) {
          console.warn('⏱️ License polling timeout after all attempts');
          if (!isMountedRef.current) return;
          setPollingStatus('timeout');
          return;
        }

        // Schedule next poll with exponential backoff
        const nextDelay = BACKOFF_MS[attemptIndex];
        console.log(`Retrying in ${nextDelay}ms...`);

        pollingTimeoutRef.current = setTimeout(() => {
          poll();
        }, nextDelay);

      } catch (error) {
        console.error(`Polling attempt ${attemptNumber} failed:`, error);

        if (!isMountedRef.current) return;

        attemptIndex++;

        if (attemptIndex >= BACKOFF_MS.length) {
          console.error('Polling failed after all attempts');
          setPollingStatus('timeout');
          return;
        }

        // Retry with exponential backoff even on error
        const nextDelay = BACKOFF_MS[attemptIndex];
        console.log(`Retrying after error in ${nextDelay}ms...`);

        pollingTimeoutRef.current = setTimeout(() => {
          poll();
        }, nextDelay);
      }
    };

    await poll();
  }, [onLicenseActivated]);

  const handlePaymentComplete = () => {
    // Preserve state when changing status
    setState(prev => ({ ...prev, status: 'success' }));

    // Start polling BEFORE notifying parent (so modal stays open)
    if (installationId) {
      pollForLicenseKey(installationId).finally(() => {
        // Only notify parent after polling completes or times out
        onSuccess?.(state.sessionId || '');
      });
    } else {
      // No installation ID, notify immediately
      onSuccess?.(state.sessionId || '');
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

              {/* Installation ID Display */}
              {installationId && (
                <Paper withBorder p="sm" radius="md">
                  <Stack gap="xs">
                    <Text size="xs" fw={600}>
                      {t('payment.installationId', 'Installation ID')}
                    </Text>
                    <Code block>{installationId}</Code>
                  </Stack>
                </Paper>
              )}

              {/* License Key Polling Status */}
              {pollingStatus === 'polling' && (
                <Group gap="xs">
                  <Loader size="sm" />
                  <Text size="sm" c="dimmed">
                    {t('payment.generatingLicense', 'Generating your license key...')}
                  </Text>
                </Group>
              )}

              {pollingStatus === 'ready' && licenseKey && (
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
