import React, { useState, useEffect } from 'react';
import { Modal, Button, Text, Alert, Loader, Stack } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { saasBillingService } from '@app/services/saasBillingService';
import { Z_INDEX_OVER_CONFIG_MODAL } from '@app/styles/zIndex';
import OpenInBrowserIcon from '@mui/icons-material/OpenInBrowser';

type CheckoutState = {
  status: 'idle' | 'loading' | 'opened' | 'refreshing' | 'error';
  error?: string;
  sessionPlanId?: string;
};

interface SaaSStripeCheckoutProps {
  opened: boolean;
  onClose: () => void;
  planId: string | null;
  onSuccess?: () => void;
}

export const SaaSStripeCheckout: React.FC<SaaSStripeCheckoutProps> = ({
  opened,
  onClose,
  planId,
  onSuccess
}) => {
  const { t } = useTranslation();
  const [state, setState] = useState<CheckoutState>({ status: 'idle' });

  const createCheckoutSession = async () => {
    if (!planId) {
      setState({ status: 'error', error: 'No plan selected' });
      return;
    }

    try {
      setState({ status: 'loading' });

      // Map UI plan IDs to Stripe plan IDs
      const stripePlanId = planId === 'team' ? 'pro' : planId;

      // Open checkout in browser (returns void, opens browser window)
      await saasBillingService.openCheckout(
        stripePlanId as 'pro',
        window.location.origin
      );

      setState({
        status: 'opened',
        sessionPlanId: planId
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create checkout session';
      console.error('[SaaSStripeCheckout] Error creating checkout:', err);
      setState({
        status: 'error',
        error: errorMessage
      });
    }
  };

  const handleRefreshClick = async () => {
    console.log('[SaaSStripeCheckout] User requested refresh after checkout');
    setState({ ...state, status: 'refreshing' });

    // Give Stripe webhooks a moment to process (2-3 seconds)
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Trigger the refresh
    if (onSuccess) {
      await onSuccess();
    }

    // Close modal after refresh
    onClose();
  };

  const handleClose = () => {
    // Reset state to idle to clean up the session
    setState({ status: 'idle', error: undefined, sessionPlanId: undefined });
    onClose();
  };

  // Initialize checkout when modal opens or plan changes
  useEffect(() => {
    if (opened) {
      // Check if we need a new session (first time or plan changed)
      const needsNewSession =
        state.status === 'idle' ||
        !state.sessionPlanId ||
        state.sessionPlanId !== planId;

      if (needsNewSession) {
        console.log('[SaaSStripeCheckout] Opening checkout in browser for plan:', planId);
        createCheckoutSession();
      }
    } else if (!opened) {
      // Clean up state when modal closes
      setState({ status: 'idle', error: undefined, sessionPlanId: undefined });
    }
  }, [opened, planId]);

  const renderContent = () => {
    switch (state.status) {
      case 'loading':
        return (
          <div className="flex flex-col items-center justify-center py-8">
            <Loader size="lg" />
            <Text size="sm" c="dimmed" mt="md">
              {t('payment.preparing', 'Preparing your checkout...')}
            </Text>
          </div>
        );

      case 'opened':
        return (
          <Alert color="blue" title={t('payment.checkoutOpened', 'Checkout Opened in Browser')} icon={<OpenInBrowserIcon />}>
            <Stack gap="md">
              <Text size="sm">
                {t('payment.checkoutInstructions', 'Complete your purchase in the browser window that just opened. After payment is complete, return here and click the button below to refresh your billing information.')}
              </Text>
              <Button
                variant="filled"
                color="blue"
                onClick={handleRefreshClick}
                fullWidth
              >
                {t('payment.refreshBilling', 'I\'ve Completed Payment - Refresh Billing')}
              </Button>
              <Button
                variant="subtle"
                onClick={handleClose}
                fullWidth
              >
                {t('payment.closeLater', 'I\'ll Do This Later')}
              </Button>
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

  const getPlanName = () => {
    if (planId === 'team') return t('plan.team.name', 'Team');
    if (planId === 'enterprise') return t('plan.enterprise.name', 'Enterprise');
    return t('plan.free.name', 'Free');
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={
        <div>
          <Text fw={600} size="lg">
            {t('payment.upgradeTitle', 'Upgrade to {{planName}}', { planName: getPlanName() })}
          </Text>
        </div>
      }
      size="md"
      centered
      withCloseButton={true}
      closeOnEscape={true}
      closeOnClickOutside={false}
      zIndex={Z_INDEX_OVER_CONFIG_MODAL}
    >
      {renderContent()}
    </Modal>
  );
};
