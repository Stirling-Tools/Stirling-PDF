import React, { useState, useEffect } from 'react';
import { Modal, Button, Text, Alert, Loader, Stack } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { loadStripe } from '@stripe/stripe-js';
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from '@stripe/react-stripe-js';
import licenseService from '@app/services/licenseService';
import { Z_INDEX_OVER_CONFIG_MODAL } from '@app/styles/zIndex';

// Initialize Stripe - this should come from environment variables
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '');

interface StripeCheckoutProps {
  opened: boolean;
  onClose: () => void;
  planId: string;
  planName: string;
  planPrice: number;
  currency: string;
  onSuccess?: (sessionId: string) => void;
  onError?: (error: string) => void;
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
  planId,
  planName,
  planPrice,
  currency,
  onSuccess,
  onError,
}) => {
  const { t } = useTranslation();
  const [state, setState] = useState<CheckoutState>({ status: 'idle' });

  const createCheckoutSession = async () => {
    try {
      setState({ status: 'loading' });

      const response = await licenseService.createCheckoutSession({
        planId,
        currency,
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

  const handlePaymentComplete = () => {
    setState({ status: 'success' });
    onSuccess?.(state.sessionId || '');
  };

  const handleClose = () => {
    setState({ status: 'idle' });
    onClose();
  };

  // Initialize checkout when modal opens
  useEffect(() => {
    if (opened && state.status === 'idle') {
      createCheckoutSession();
    } else if (!opened) {
      setState({ status: 'idle' });
    }
  }, [opened]);

  const renderContent = () => {
    switch (state.status) {
      case 'loading':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem 0' }}>
            <Loader size="lg" />
            <Text size="sm" c="dimmed" mt="md">
              {t('payment.preparing', 'Preparing your checkout...')}
            </Text>
          </div>
        );

      case 'ready':
        if (!state.clientSecret) return null;

        return (
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
        );

      case 'success':
        return (
          <Alert color="green" title={t('payment.success', 'Payment Successful!')}>
            <Stack gap="md">
              <Text size="sm">
                {t(
                  'payment.successMessage',
                  'Your subscription has been activated successfully. You will receive a confirmation email shortly.'
                )}
              </Text>
              <Text size="xs" c="dimmed">
                {t('payment.autoClose', 'This window will close automatically...')}
              </Text>
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
        <div>
          <Text fw={600} size="lg">
            {t('payment.upgradeTitle', 'Upgrade to {{planName}}', { planName })}
          </Text>
          <Text size="sm" c="dimmed">
            {currency}
            {planPrice}/{t('plan.period.month', 'month')}
          </Text>
        </div>
      }
      size="xl"
      centered
      withCloseButton={state.status !== 'ready'}
      closeOnEscape={state.status !== 'ready'}
      closeOnClickOutside={state.status !== 'ready'}
      zIndex={Z_INDEX_OVER_CONFIG_MODAL}
    >
      {renderContent()}
    </Modal>
  );
};

export default StripeCheckout;
