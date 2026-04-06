import React, { useState, useEffect } from 'react';
import { Modal, Button, Text, Alert, Loader, Stack } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import apiClient from '@app/services/apiClient';
import { Z_INDEX_OVER_SETTINGS_MODAL } from '@app/styles/zIndex';

export type PurchaseType = 'subscription' | 'credits';
export type CreditsPack = 'xsmall' | 'small' | 'medium' | 'large' | null;
export type PlanID =  'pro' | null;

interface StripeCheckoutProps {
  opened: boolean;
  onClose: () => void;
  planId?: PlanID;
  purchaseType?: PurchaseType;
  creditsPack?: CreditsPack;
  planName?: string;
  planPrice?: number;
  currency?: string;
  isTrialConversion?: boolean;
  planGroup?: unknown;
  minimumSeats?: number;
  onLicenseActivated?: (licenseInfo: {licenseType: string; enabled: boolean; maxUsers: number; hasKey: boolean}) => void;
  hostedCheckoutSuccess?: {
    isUpgrade: boolean;
    licenseKey?: string;
  } | null;
  onSuccess?: (sessionId: string) => void;
  onError?: (error: string) => void;
}

type CheckoutState = {
  status: 'idle' | 'loading' | 'redirecting' | 'error';
  error?: string;
};

/**
 * Polar.sh checkout component.
 * Creates a checkout session via the backend and redirects to Polar's hosted checkout page.
 */
const StripeCheckout: React.FC<StripeCheckoutProps> = ({
  opened,
  onClose,
  planId,
  purchaseType,
  creditsPack,
  planName,
  isTrialConversion,
  onError
}) => {
  const { t } = useTranslation();
  const [state, setState] = useState<CheckoutState>({ status: 'idle' });

  const createCheckoutSession = async () => {
    try {
      setState({ status: 'loading' });

      const response = await apiClient.post('/api/v1/billing/checkout', {
        purchase_type: purchaseType,
        plan: planId,
        credits_pack: creditsPack,
        callback_base_url: window.location.origin,
        trial_conversion: isTrialConversion || false
      });

      const data = response.data;

      if (data?.url) {
        // Redirect to Polar hosted checkout
        setState({ status: 'redirecting' });
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL received from server');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create checkout session';
      setState({ status: 'error', error: errorMessage });
      onError?.(errorMessage);
    }
  };

  const handleClose = () => {
    setState({ status: 'idle', error: undefined });
    onClose();
  };

  useEffect(() => {
    if (opened && state.status === 'idle') {
      createCheckoutSession();
    } else if (!opened) {
      setState({ status: 'idle', error: undefined });
    }
  }, [opened, purchaseType, planId, creditsPack]);

  const renderContent = () => {
    switch (state.status) {
      case 'loading':
      case 'redirecting':
        return (
          <div className="flex flex-col items-center justify-center py-8">
            <Loader size="lg" />
            <Text size="sm" c="dimmed" mt="md">
              {state.status === 'redirecting'
                ? t('payment.redirecting', 'Redirecting to checkout...')
                : t('payment.preparing', 'Preparing your checkout...')}
            </Text>
          </div>
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
        </div>
      }
      size="xl"
      centered
      withCloseButton={true}
      closeOnEscape={true}
      closeOnClickOutside={false}
      zIndex={Z_INDEX_OVER_SETTINGS_MODAL}
    >
      {renderContent()}
    </Modal>
  );
};

export default StripeCheckout;
export { StripeCheckout };
