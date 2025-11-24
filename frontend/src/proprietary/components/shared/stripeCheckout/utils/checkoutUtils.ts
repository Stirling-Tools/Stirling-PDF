import { TFunction } from 'i18next';
import { CheckoutStage } from '@app/components/shared/stripeCheckout/types/checkout';

/**
 * Validate email address format
 */
export const validateEmail = (email: string): { valid: boolean; error: string } => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return {
      valid: false,
      error: 'Please enter a valid email address'
    };
  }
  return { valid: true, error: '' };
};

/**
 * Get dynamic modal title based on current stage
 */
export const getModalTitle = (
  stage: CheckoutStage,
  planName: string,
  t: TFunction
): string => {
  switch (stage) {
    case 'email':
      return t('payment.emailStage.modalTitle', 'Get Started - {{planName}}', { planName });
    case 'plan-selection':
      return t('payment.planStage.modalTitle', 'Select Billing Period - {{planName}}', { planName });
    case 'payment':
      return t('payment.paymentStage.modalTitle', 'Complete Payment - {{planName}}', { planName });
    case 'success':
      return t('payment.success', 'Payment Successful!');
    case 'error':
      return t('payment.error', 'Payment Error');
    default:
      return t('payment.upgradeTitle', 'Upgrade to {{planName}}', { planName });
  }
};
