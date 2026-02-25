import { useEffect, useState } from 'react';
import { Stack, Loader, Alert, Button, Center, Text, Flex } from '@mantine/core';
import RefreshIcon from '@mui/icons-material/Refresh';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import { useTranslation } from 'react-i18next';
import { useSaaSBilling } from '@app/contexts/SaasBillingContext';
import { useSaaSTeam } from '@app/contexts/SaaSTeamContext';
import { useSaaSPlans } from '@app/hooks/useSaaSPlans';
import { connectionModeService } from '@app/services/connectionModeService';
import { SaaSCheckoutProvider } from '@app/contexts/SaaSCheckoutContext';
import { ActiveSubscriptionCard } from '@app/components/shared/config/configSections/plan/ActiveSubscriptionCard';
import { SaaSAvailablePlansSection } from '@app/components/shared/config/configSections/plan/SaaSAvailablePlansSection';

/**
 * SaaS Plan & Billing section
 * Shows subscription status, billing information, and usage metrics
 * Only visible when connected to SaaS
 */
export function SaasPlanSection() {
  const { t } = useTranslation();
  const [isSaasMode, setIsSaasMode] = useState<boolean | null>(null);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);

  // Billing context
  const {
    subscription,
    usage,
    tier,
    isTrialing,
    trialDaysRemaining,
    loading,
    error,
    refreshBilling,
    price,
    currency,
    isManagedTeamMember,
    openBillingPortal,
  } = useSaaSBilling();

  // Team data for ActiveSubscriptionCard
  const { currentTeam, isTeamLeader, isPersonalTeam } = useSaaSTeam();

  // Plans data
  const { plans, loading: plansLoading, error: plansError } = useSaaSPlans('usd');

  // Check connection mode on mount
  useEffect(() => {
    const checkMode = async () => {
      const mode = await connectionModeService.getCurrentMode();
      setIsSaasMode(mode === 'saas');
    };

    checkMode();

    // Subscribe to mode changes
    const unsubscribe = connectionModeService.subscribeToModeChanges(async (config) => {
      setIsSaasMode(config.mode === 'saas');
    });

    return unsubscribe;
  }, []);

  // Handle "Manage Billing" button click
  const handleManageBilling = async () => {
    setIsOpeningPortal(true);

    try {
      // Context handles opening portal and auto-refresh
      await openBillingPortal();
    } catch (error) {
      console.error('[SaasPlanSection] Failed to open billing portal:', error);
    } finally {
      setIsOpeningPortal(false);
    }
  };

  // Format date for trial end
  const formatDate = (timestamp: number): string => {
    return new Date(timestamp * 1000).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  // Don't render anything if not in SaaS mode
  if (isSaasMode === false) {
    return (
      <Center p="xl">
        <Alert color="blue" variant="light" icon={<ErrorOutlineIcon sx={{ fontSize: 16 }} />}>
          <Text size="sm">
            {t(
              'settings.planBilling.notAvailable',
              'Plan & Billing is only available when connected to Stirling Cloud (SaaS mode).'
            )}
          </Text>
        </Alert>
      </Center>
    );
  }

  // Loading state while checking mode
  if (isSaasMode === null) {
    return (
      <Center p="xl">
        <Loader size="sm" />
      </Center>
    );
  }

  // Loading state while fetching billing/team data
  // Note: loading already includes teamLoading from billing context
  if (loading) {
    return (
      <Center p="xl">
        <Stack align="center" gap="md">
          <Loader size="md" />
          <Text size="sm" c="dimmed">
            {t('settings.planBilling.loading', 'Loading billing information...')}
          </Text>
        </Stack>
      </Center>
    );
  }

  // Error state
  if (error) {
    return (
      <Center p="xl">
        <Alert
          color="red"
          variant="light"
          icon={<ErrorOutlineIcon sx={{ fontSize: 16 }} />}
          title={t('settings.planBilling.errors.fetchFailed', 'Unable to fetch billing data')}
        >
          <Stack gap="sm">
            <Text size="sm">{error}</Text>
            <Button
              variant="light"
              leftSection={<RefreshIcon sx={{ fontSize: 16 }} />}
              onClick={refreshBilling}
              size="xs"
            >
              {t('settings.planBilling.errors.retry', 'Retry')}
            </Button>
          </Stack>
        </Alert>
      </Center>
    );
  }

  // Main content
  return (
    <SaaSCheckoutProvider>
      <div>
        {/* Header with title and Manage Billing button */}
        <Flex justify="space-between" align="center" mb="md">
          <h3 style={{ margin: 0, color: 'var(--mantine-color-text)', fontSize: '1rem' }}>
            {t('settings.planBilling.currentPlan', 'Active Plan')}
          </h3>
          {tier !== 'free' && !isManagedTeamMember && (
            <Button
              variant="light"
              size="sm"
              onClick={handleManageBilling}
              loading={isOpeningPortal}
              disabled={isOpeningPortal}
            >
              {t('settings.planBilling.billing.manageBilling', 'Manage Billing')}
            </Button>
          )}
        </Flex>

        {/* Trial Status Alert */}
        {isTrialing && trialDaysRemaining !== undefined && subscription?.currentPeriodEnd && (
          <Alert
            color="blue"
            icon={<AccessTimeIcon sx={{ fontSize: 16 }} />}
            mt="md"
            mb="md"
            title={t('settings.planBilling.trial.title', 'Free Trial Active')}
          >
            <Text size="sm">
              {t('settings.planBilling.trial.daysRemainingFull', 'Your trial ends in {{days}} days', {
                days: trialDaysRemaining,
                defaultValue: `Your trial ends in ${trialDaysRemaining} days`,
              })}
            </Text>
            <Text size="xs" c="dimmed">
              {t('settings.planBilling.trial.endDate', 'Expires: {{date}}', {
                date: formatDate(subscription.currentPeriodEnd),
                defaultValue: `Expires: ${formatDate(subscription.currentPeriodEnd)}`,
              })}
            </Text>
          </Alert>
        )}

        {/* Plan cards */}
        <Stack gap="lg">
          {/* Current subscription card */}
          <ActiveSubscriptionCard
            tier={tier}
            subscription={subscription}
            usage={usage}
            isTrialing={isTrialing}
            price={price}
            currency={currency}
            currentTeam={currentTeam}
            isTeamLeader={isTeamLeader}
            isPersonalTeam={isPersonalTeam}
          />

          {/* Available plans grid */}
          <SaaSAvailablePlansSection
            plans={plans}
            currentTier={tier}
            loading={plansLoading}
            error={plansError}
          />
        </Stack>
      </div>
    </SaaSCheckoutProvider>
  );
}
