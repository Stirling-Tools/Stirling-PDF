import React, { useEffect } from 'react';
import { Modal, Text, Group, ActionIcon } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import LocalIcon from '@app/components/shared/LocalIcon';
import licenseService from '@app/services/licenseService';
import { useIsMobile } from '@app/hooks/useIsMobile';
import { Z_INDEX_OVER_CONFIG_MODAL } from '@app/styles/zIndex';
import { StripeCheckoutProps } from '@app/components/shared/stripeCheckout/types/checkout';
import { validateEmail, getModalTitle } from '@app/components/shared/stripeCheckout/utils/checkoutUtils';
import { calculateSavings } from '@app/components/shared/stripeCheckout/utils/savingsCalculator';
import { useCheckoutState } from '@app/components/shared/stripeCheckout/hooks/useCheckoutState';
import { useCheckoutNavigation } from '@app/components/shared/stripeCheckout/hooks/useCheckoutNavigation';
import { useLicensePolling } from '@app/components/shared/stripeCheckout/hooks/useLicensePolling';
import { useCheckoutSession } from '@app/components/shared/stripeCheckout/hooks/useCheckoutSession';
import { EmailStage } from '@app/components/shared/stripeCheckout/stages/EmailStage';
import { PlanSelectionStage } from '@app/components/shared/stripeCheckout/stages/PlanSelectionStage';
import { PaymentStage } from '@app/components/shared/stripeCheckout/stages/PaymentStage';
import { SuccessStage } from '@app/components/shared/stripeCheckout/stages/SuccessStage';
import { ErrorStage } from '@app/components/shared/stripeCheckout/stages/ErrorStage';

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
  const isMobile = useIsMobile();

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
        // Only skip email if license is PRO or ENTERPRISE (not NORMAL/free tier)
        if (licenseInfo?.licenseType && licenseInfo.licenseType !== 'NORMAL') {
          // Has valid premium license - skip email stage
          console.log('Valid premium license detected - skipping email stage');
          checkoutState.setCurrentLicenseKey(licenseInfo.licenseKey || null);
          checkoutState.setState({ currentStage: 'plan-selection', loading: false });
        } else {
          // No valid premium license - start at email stage
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
    // Don't block checkout - hosted mode works without publishable key
    // The checkout will automatically redirect to Stripe hosted page if key is missing
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
            onSelectPlan={handlePlanSelect}
          />
        );

      case 'payment':
        return (
          <PaymentStage
            clientSecret={checkoutState.state.clientSecret || null}
            selectedPlan={checkoutState.selectedPlan}
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

  const canGoBack = checkoutState.stageHistory.length > 0;

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={
        <Group gap="sm" wrap="nowrap">
          {canGoBack && (
            <ActionIcon
              variant="subtle"
              size="lg"
              onClick={navigation.goBack}
              aria-label={t('common.back', 'Back')}
            >
              <LocalIcon icon="arrow-back" width={20} height={20} />
            </ActionIcon>
          )}
          <Text fw={600} size="lg">
            {getModalTitle(checkoutState.state.currentStage, planGroup.name, t)}
          </Text>
        </Group>
      }
      size={isMobile ? "100%" : 980}
      centered
      radius="lg"
      withCloseButton={true}
      closeOnEscape={true}
      closeOnClickOutside={false}
      fullScreen={isMobile}
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
