import React, { useEffect } from 'react';
import { Modal, Text, Alert, Stack, Button } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { loadStripe } from '@stripe/stripe-js';
import licenseService from '@app/services/licenseService';
import { Z_INDEX_OVER_CONFIG_MODAL } from '@app/styles/zIndex';
import { StripeCheckoutProps } from './types/checkout';
import { validateEmail, getModalTitle } from './utils/checkoutUtils';
import { calculateSavings } from './utils/savingsCalculator';
import { useCheckoutState } from './hooks/useCheckoutState';
import { useCheckoutNavigation } from './hooks/useCheckoutNavigation';
import { useLicensePolling } from './hooks/useLicensePolling';
import { useCheckoutSession } from './hooks/useCheckoutSession';
import { EmailStage } from './stages/EmailStage';
import { PlanSelectionStage } from './stages/PlanSelectionStage';
import { PaymentStage } from './stages/PaymentStage';
import { SuccessStage } from './stages/SuccessStage';
import { ErrorStage } from './stages/ErrorStage';

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

const StripeCheckout: React.FC<StripeCheckoutProps> = ({
  opened,
  onClose,
  planGroup,
  minimumSeats = 1,
  onSuccess,
  onError,
  onLicenseActivated,
  hostedCheckoutSuccess,
}) => {
  const { t } = useTranslation();

  // Initialize all state via custom hook
  const checkoutState = useCheckoutState(planGroup);

  // Initialize navigation hooks
  const navigation = useCheckoutNavigation(
    checkoutState.state,
    checkoutState.setState,
    checkoutState.stageHistory,
    checkoutState.setStageHistory
  );

  // Initialize license polling hook
  const polling = useLicensePolling(
    checkoutState.isMountedRef,
    checkoutState.setPollingStatus,
    checkoutState.setLicenseKey,
    onLicenseActivated
  );

  // Initialize checkout session hook
  const session = useCheckoutSession(
    checkoutState.selectedPlan,
    checkoutState.state,
    checkoutState.setState,
    checkoutState.installationId,
    checkoutState.setInstallationId,
    checkoutState.currentLicenseKey,
    checkoutState.setCurrentLicenseKey,
    checkoutState.setPollingStatus,
    minimumSeats,
    polling.pollForLicenseKey,
    onSuccess,
    onError,
    onLicenseActivated
  );

  // Calculate savings
  const savings = calculateSavings(planGroup, minimumSeats);

  // Email submission handler
  const handleEmailSubmit = () => {
    const validation = validateEmail(checkoutState.emailInput);
    if (validation.valid) {
      checkoutState.setState(prev => ({ ...prev, email: checkoutState.emailInput }));
      navigation.goToStage('plan-selection');
    } else {
      checkoutState.setEmailError(validation.error);
    }
  };

  // Plan selection handler
  const handlePlanSelect = (period: 'monthly' | 'yearly') => {
    checkoutState.setSelectedPeriod(period);
    navigation.goToStage('payment');
  };

  // Close handler
  const handleClose = () => {
    // Clear any active polling
    if (checkoutState.pollingTimeoutRef.current) {
      clearTimeout(checkoutState.pollingTimeoutRef.current);
      checkoutState.pollingTimeoutRef.current = null;
    }

    checkoutState.resetState();
    onClose();
  };

  // Cleanup on unmount
  useEffect(() => {
    checkoutState.isMountedRef.current = true;

    return () => {
      checkoutState.isMountedRef.current = false;
      if (checkoutState.pollingTimeoutRef.current) {
        clearTimeout(checkoutState.pollingTimeoutRef.current);
        checkoutState.pollingTimeoutRef.current = null;
      }
    };
  }, [checkoutState.isMountedRef, checkoutState.pollingTimeoutRef]);

  // Initialize stage based on existing license
  useEffect(() => {
    if (!opened) return;

    // Handle hosted checkout success - open directly to success state
    if (hostedCheckoutSuccess) {
      console.log('Opening modal to success state for hosted checkout return');

      // Set appropriate state based on upgrade vs new subscription
      if (hostedCheckoutSuccess.isUpgrade) {
        checkoutState.setCurrentLicenseKey('existing'); // Flag to indicate upgrade
        checkoutState.setPollingStatus('ready');
      } else if (hostedCheckoutSuccess.licenseKey) {
        checkoutState.setLicenseKey(hostedCheckoutSuccess.licenseKey);
        checkoutState.setPollingStatus('ready');
      }

      // Set to success state to show success UI
      checkoutState.setState({ currentStage: 'success', loading: false });
      return;
    }

    // Check for existing license to skip email stage
    const checkExistingLicense = async () => {
      try {
        const licenseInfo = await licenseService.getLicenseInfo();
        if (licenseInfo && licenseInfo.licenseKey) {
          // Has existing license - skip email stage
          console.log('Existing license detected - skipping email stage');
          checkoutState.setCurrentLicenseKey(licenseInfo.licenseKey);
          checkoutState.setState({ currentStage: 'plan-selection', loading: false });
        } else {
          // No license - start at email stage
          checkoutState.setState({ currentStage: 'email', loading: false });
        }
      } catch (error) {
        console.warn('Could not check for existing license:', error);
        // Default to email stage if check fails
        checkoutState.setState({ currentStage: 'email', loading: false });
      }
    };

    checkExistingLicense();
  }, [opened, hostedCheckoutSuccess, checkoutState.setCurrentLicenseKey, checkoutState.setPollingStatus, checkoutState.setLicenseKey, checkoutState.setState]);

  // Trigger checkout session creation when entering payment stage
  useEffect(() => {
    if (
      checkoutState.state.currentStage === 'payment' &&
      !checkoutState.state.clientSecret &&
      !checkoutState.state.loading
    ) {
      session.createCheckoutSession();
    }
  }, [checkoutState.state.currentStage, checkoutState.state.clientSecret, checkoutState.state.loading, session]);

  // Render stage content
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

    switch (checkoutState.state.currentStage) {
      case 'email':
        return (
          <EmailStage
            emailInput={checkoutState.emailInput}
            setEmailInput={checkoutState.setEmailInput}
            emailError={checkoutState.emailError}
            onSubmit={handleEmailSubmit}
          />
        );

      case 'plan-selection':
        return (
          <PlanSelectionStage
            planGroup={planGroup}
            minimumSeats={minimumSeats}
            savings={savings}
            canGoBack={checkoutState.stageHistory.length > 0}
            onBack={navigation.goBack}
            onSelectPlan={handlePlanSelect}
          />
        );

      case 'payment':
        return (
          <PaymentStage
            clientSecret={checkoutState.state.clientSecret || null}
            selectedPlan={checkoutState.selectedPlan}
            selectedPeriod={checkoutState.selectedPeriod}
            planName={planGroup.name}
            loading={checkoutState.state.loading || false}
            canGoBack={checkoutState.stageHistory.length > 0}
            onBack={navigation.goBack}
            onPaymentComplete={session.handlePaymentComplete}
          />
        );

      case 'success':
        return (
          <SuccessStage
            pollingStatus={checkoutState.pollingStatus}
            currentLicenseKey={checkoutState.currentLicenseKey}
            licenseKey={checkoutState.licenseKey}
            onClose={handleClose}
          />
        );

      case 'error':
        return (
          <ErrorStage
            error={checkoutState.state.error || 'An unknown error occurred'}
            onClose={handleClose}
          />
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
          {getModalTitle(checkoutState.state.currentStage, planGroup.name, t)}
        </Text>
      }
      size="lg"
      centered
      withCloseButton={true}
      closeOnEscape={true}
      closeOnClickOutside={false}
      zIndex={Z_INDEX_OVER_CONFIG_MODAL}
      styles={{
        body: {},
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
