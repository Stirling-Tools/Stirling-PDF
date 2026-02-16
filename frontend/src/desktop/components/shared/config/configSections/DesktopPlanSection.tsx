import { useEffect, useState } from 'react';
import { Stack, Loader, Alert, Button, Center, Text, Flex } from '@mantine/core';
import RefreshIcon from '@mui/icons-material/Refresh';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import { useTranslation } from 'react-i18next';
import { useDesktopBilling } from '@app/hooks/useDesktopBilling';
import { useDesktopTeam } from '@app/hooks/useDesktopTeam';
import { connectionModeService } from '@app/services/connectionModeService';
import { desktopBillingService } from '@app/services/desktopBillingService';
import { ActiveSubscriptionCard } from './plan/ActiveSubscriptionCard';
import { PlanUpgradeCard } from './plan/PlanUpgradeCard';

/**
 * Desktop Plan & Billing section
 * Shows subscription status, billing information, and usage metrics
 * Only visible when connected to SaaS
 */
export function DesktopPlanSection() {
  const { t } = useTranslation();
  const [isSaasMode, setIsSaasMode] = useState<boolean | null>(null);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);

  // Fetch team data first to determine if user is a managed team member
  const { currentTeam, isTeamLeader, isPersonalTeam } = useDesktopTeam();

  // Check if user is a team member whose billing is managed by the team
  const isManagedTeamMember = currentTeam && !isPersonalTeam && !isTeamLeader;

  // Only fetch billing data if:
  // - User is a team leader of a non-personal team (manages team billing)
  // - NOT for personal teams (no billing)
  // - NOT for managed team members (billing managed by leader)
  const shouldFetchBilling = !!currentTeam && !isPersonalTeam && isTeamLeader;

  const {
    subscription,
    usage,
    tier,
    isTrialing,
    trialDaysRemaining,
    loading,
    error,
    refetch,
    price,
    currency,
  } = useDesktopBilling(shouldFetchBilling);

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
      const returnUrl = window.location.href;
      await desktopBillingService.openBillingPortal(returnUrl);

      // Refetch billing data after user returns
      setTimeout(() => {
        refetch();
      }, 1000);
    } catch (error) {
      console.error('[DesktopPlanSection] Failed to open billing portal:', error);
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

  // Loading state while fetching billing data
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
              onClick={refetch}
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

        {/* Upgrade card (only shown for free tier) */}
        <PlanUpgradeCard currentTier={tier} />
      </Stack>
    </div>
  );
}
