import React, { useState } from 'react';
import { Modal, Text, Group, ActionIcon, Stack, Paper, Grid, TextInput, Button, Alert } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import LocalIcon from '@app/components/shared/LocalIcon';
import { EmailStage } from '@app/components/shared/stripeCheckout/stages/EmailStage';
import { validateEmail } from '@app/components/shared/stripeCheckout/utils/checkoutUtils';
import { getClickablePaperStyle } from '@app/components/shared/stripeCheckout/utils/cardStyles';
import { STATIC_STRIPE_LINKS, buildStripeUrlWithEmail } from '@app/constants/staticStripeLinks';
import { alert } from '@app/components/toast';
import { Z_INDEX_OVER_CONFIG_MODAL } from '@app/styles/zIndex';
import { useIsMobile } from '@app/hooks/useIsMobile';
import licenseService from '@app/services/licenseService';
import { useLicense } from '@app/contexts/LicenseContext';

interface StaticCheckoutModalProps {
  opened: boolean;
  onClose: () => void;
  planName: 'server' | 'enterprise';
  isUpgrade?: boolean;
}

type Stage = 'email' | 'period-selection' | 'license-activation';

const StaticCheckoutModal: React.FC<StaticCheckoutModalProps> = ({
  opened,
  onClose,
  planName,
  isUpgrade = false,
}) => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { refetchLicense } = useLicense();

  const [stage, setStage] = useState<Stage>('email');
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [stageHistory, setStageHistory] = useState<Stage[]>([]);

  // License activation state
  const [licenseKey, setLicenseKey] = useState('');
  const [savingLicense, setSavingLicense] = useState(false);
  const [licenseActivated, setLicenseActivated] = useState(false);

  const handleEmailSubmit = () => {
    const validation = validateEmail(email);
    if (validation.valid) {
      setEmailError('');
      setStageHistory([...stageHistory, 'email']);
      setStage('period-selection');
    } else {
      setEmailError(validation.error);
    }
  };

  const handlePeriodSelect = (period: 'monthly' | 'yearly') => {
    const baseUrl = STATIC_STRIPE_LINKS[planName][period];
    const urlWithEmail = buildStripeUrlWithEmail(baseUrl, email);

    // Open Stripe checkout in new tab
    window.open(urlWithEmail, '_blank');

    // Transition to license activation stage
    setStageHistory([...stageHistory, 'period-selection']);
    setStage('license-activation');
  };

  const handleActivateLicense = async () => {
    if (!licenseKey.trim()) {
      alert({
        alertType: 'error',
        title: t('admin.error', 'Error'),
        body: t('admin.settings.premium.noInput', 'Please provide a license key'),
      });
      return;
    }

    try {
      setSavingLicense(true);
      const response = await licenseService.saveLicenseKey(licenseKey.trim());

      if (response.success) {
        // Refresh license context to update all components
        await refetchLicense();

        setLicenseActivated(true);

        alert({
          alertType: 'success',
          title: t('success', 'Success'),
          body: t(
            'admin.settings.premium.key.successMessage',
            'License key activated successfully'
          ),
        });
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

  const handleGoBack = () => {
    if (stageHistory.length > 0) {
      const newHistory = [...stageHistory];
      const previousStage = newHistory.pop();
      setStageHistory(newHistory);
      if (previousStage) {
        setStage(previousStage);
      }
    }
  };

  const handleClose = () => {
    // Reset state when closing
    setStage('email');
    setEmail('');
    setEmailError('');
    setStageHistory([]);
    setLicenseKey('');
    setSavingLicense(false);
    setLicenseActivated(false);
    onClose();
  };

  const getModalTitle = () => {
    if (stage === 'email') {
      if (isUpgrade) {
        return t('plan.static.upgradeToEnterprise', 'Upgrade to Enterprise');
      }
      return planName === 'server'
        ? t('plan.static.getLicense', 'Get Server License')
        : t('plan.static.upgradeToEnterprise', 'Upgrade to Enterprise');
    }
    if (stage === 'period-selection') {
      return t('plan.static.selectPeriod', 'Select Billing Period');
    }
    if (stage === 'license-activation') {
      return t('plan.static.activateLicense', 'Activate Your License');
    }
    return '';
  };

  const renderContent = () => {
    switch (stage) {
      case 'email':
        return (
          <EmailStage
            emailInput={email}
            setEmailInput={setEmail}
            emailError={emailError}
            onSubmit={handleEmailSubmit}
          />
        );

      case 'period-selection':
        return (
          <Stack gap="lg" style={{ padding: '1rem 2rem' }}>
            <Grid gutter="xl" style={{ marginTop: '1rem' }}>
              {/* Monthly Option */}
              <Grid.Col span={6}>
                <Paper
                  withBorder
                  p="xl"
                  radius="md"
                  style={getClickablePaperStyle()}
                  onClick={() => handlePeriodSelect('monthly')}
                >
                  <Stack gap="md" style={{ height: '100%', minHeight: '120px' }} justify="space-between">
                    <Text size="lg" fw={600}>
                      {t('payment.monthly', 'Monthly')}
                    </Text>
                    <Text size="sm" c="dimmed">
                      {t('plan.static.monthlyBilling', 'Monthly Billing')}
                    </Text>
                  </Stack>
                </Paper>
              </Grid.Col>

              {/* Yearly Option */}
              <Grid.Col span={6}>
                <Paper
                  withBorder
                  p="xl"
                  radius="md"
                  style={getClickablePaperStyle()}
                  onClick={() => handlePeriodSelect('yearly')}
                >
                  <Stack gap="md" style={{ height: '100%', minHeight: '120px' }} justify="space-between">
                    <Text size="lg" fw={600}>
                      {t('payment.yearly', 'Yearly')}
                    </Text>
                    <Text size="sm" c="dimmed">
                      {t('plan.static.yearlyBilling', 'Yearly Billing')}
                    </Text>
                  </Stack>
                </Paper>
              </Grid.Col>
            </Grid>
          </Stack>
        );

      case 'license-activation':
        return (
          <Stack gap="lg" style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
            <Alert
              variant="light"
              color="blue"
              icon={<LocalIcon icon="info-rounded" width="1rem" height="1rem" />}
            >
              <Stack gap="sm">
                <Text size="sm" fw={600}>
                  {t('plan.static.licenseActivation.checkoutOpened', 'Checkout Opened in New Tab')}
                </Text>
                <Text size="sm">
                  {t(
                    'plan.static.licenseActivation.instructions',
                    'Complete your purchase in the Stripe tab. Once your payment is complete, you will receive an email with your license key.'
                  )}
                </Text>
              </Stack>
            </Alert>

            {licenseActivated ? (
              <Alert
                variant="light"
                color="green"
                icon={<LocalIcon icon="check-circle-rounded" width="1rem" height="1rem" />}
                title={t('plan.static.licenseActivation.success', 'License Activated!')}
              >
                <Text size="sm">
                  {t(
                    'plan.static.licenseActivation.successMessage',
                    'Your license has been successfully activated. You can now close this window.'
                  )}
                </Text>
              </Alert>
            ) : (
              <Stack gap="md">
                <Text size="sm" fw={500}>
                  {t(
                    'plan.static.licenseActivation.enterKey',
                    'Enter your license key below to activate your plan:'
                  )}
                </Text>

                <TextInput
                  label={t('admin.settings.premium.key.label', 'License Key')}
                  description={t(
                    'plan.static.licenseActivation.keyDescription',
                    'Paste the license key from your email'
                  )}
                  value={licenseKey}
                  onChange={(e) => setLicenseKey(e.target.value)}
                  placeholder="00000000-0000-0000-0000-000000000000"
                  disabled={savingLicense}
                  type="password"
                />

                <Group justify="space-between">
                  <Button variant="subtle" onClick={handleClose} disabled={savingLicense}>
                    {t('plan.static.licenseActivation.doLater', "I'll do this later")}
                  </Button>
                  <Button
                    onClick={handleActivateLicense}
                    loading={savingLicense}
                    disabled={!licenseKey.trim()}
                  >
                    {t('plan.static.licenseActivation.activate', 'Activate License')}
                  </Button>
                </Group>
              </Stack>
            )}

            {licenseActivated && (
              <Group justify="flex-end">
                <Button onClick={handleClose}>
                  {t('common.close', 'Close')}
                </Button>
              </Group>
            )}
          </Stack>
        );

      default:
        return null;
    }
  };

  const canGoBack = stageHistory.length > 0 && stage !== 'license-activation';

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
              onClick={handleGoBack}
              aria-label={t('common.back', 'Back')}
            >
              <LocalIcon icon="arrow-back" width={20} height={20} />
            </ActionIcon>
          )}
          <Text fw={600} size="lg">
            {getModalTitle()}
          </Text>
        </Group>
      }
      size={isMobile ? '100%' : 600}
      centered
      radius="lg"
      withCloseButton={true}
      closeOnEscape={true}
      closeOnClickOutside={false}
      fullScreen={isMobile}
      zIndex={Z_INDEX_OVER_CONFIG_MODAL}
    >
      {renderContent()}
    </Modal>
  );
};

export default StaticCheckoutModal;
