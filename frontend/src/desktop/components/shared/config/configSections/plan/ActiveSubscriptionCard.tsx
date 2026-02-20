import { Card, Text, Group, Badge, Stack, Tooltip, ActionIcon } from '@mantine/core';
import GroupIcon from '@mui/icons-material/Group';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { useTranslation } from 'react-i18next';
import type { BillingStatus } from '@app/services/saasBillingService';
import { Z_INDEX_OVER_CONFIG_MODAL } from '@app/styles/zIndex';

interface TeamData {
  teamId: number;
  name: string;
  isPersonal: boolean;
  isLeader: boolean;
  seatsUsed: number;
}

interface ActiveSubscriptionCardProps {
  tier: BillingStatus['tier'];
  subscription: BillingStatus['subscription'];
  usage: BillingStatus['meterUsage'];
  isTrialing: boolean;
  price?: number;
  currency?: string;
  currentTeam?: TeamData | null;
  isTeamLeader?: boolean;
  isPersonalTeam?: boolean;
}

export function ActiveSubscriptionCard({
  tier,
  subscription,
  usage,
  isTrialing,
  price,
  currency,
  currentTeam,
  isTeamLeader = false,
  isPersonalTeam = true,
}: ActiveSubscriptionCardProps) {
  const { t } = useTranslation();

  // Format timestamp to readable date
  const formatDate = (timestamp: number): string => {
    return new Date(timestamp * 1000).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  // Get tier display name
  const getTierName = (): string => {
    switch (tier) {
      case 'free':
        return t('settings.planBilling.tier.free', 'Free Plan');
      case 'team':
        return t('settings.planBilling.tier.team', 'Team Plan');
      case 'enterprise':
        return t('settings.planBilling.tier.enterprise', 'Enterprise Plan');
      default:
        return tier;
    }
  };

  // Get price display
  const getPriceDisplay = (): string => {
    if (tier === 'free') {
      return '$0/month';
    }
    // Use actual price from Stripe if available
    if (price !== undefined && currency) {
      return `${currency}${price}/month`;
    }
    // Fallback to default pricing
    return '$10/month';
  };

  // Get description
  const getDescription = (): string => {
    if (tier === 'free') {
      return t('settings.planBilling.tier.freeDescription', '50 credits per month');
    }
    return t(
      'settings.planBilling.tier.teamDescription',
      '500 credits/month included, automatic overage billing for uninterrupted service'
    );
  };

  // Format overage cost
  const formatOverageCost = (cents: number, credits: number): string => {
    return `Current overage cost: $${(cents / 100).toFixed(2)} (${credits} credits)`;
  };

  // Pro/Team card
  if (tier === 'team' || tier === 'enterprise') {
    return (
      <Card padding="lg" radius="md" withBorder>
        <Stack gap="sm">
          <Group justify="space-between" align="flex-start">
            {/* Left side: Name, badges, description */}
            <div style={{ flex: 1 }}>
              <Group gap="xs" mb="xs">
                <Text size="lg" fw={600}>
                  {!isPersonalTeam && isTeamLeader ? t('settings.planBilling.tier.team', 'Team Plan') : getTierName()}
                </Text>
                {!isPersonalTeam && (
                  <Badge color="violet" variant="light" leftSection={<GroupIcon sx={{ fontSize: 12 }} />}>
                    {t('settings.planBilling.tier.teamBadge', 'Team')}
                  </Badge>
                )}
                <Tooltip
                  label={
                    <div style={{ maxWidth: 300 }}>
                      <Text size="sm" mb="xs">
                        Team plan includes 500 credits/month.
                      </Text>
                      <Text size="sm" mb="xs">
                        Automatic overage billing at $0.05/credit ensures uninterrupted service.
                      </Text>
                      <Text size="sm">Only pay for what you use beyond included credits.</Text>
                    </div>
                  }
                  multiline
                  withArrow
                  position="right"
                  zIndex={Z_INDEX_OVER_CONFIG_MODAL}
                >
                  <ActionIcon variant="subtle" color="gray" size="sm">
                    <InfoOutlinedIcon style={{ fontSize: 18 }} />
                  </ActionIcon>
                </Tooltip>
                {isTrialing && (
                  <Badge color="blue" variant="light">
                    {t('settings.planBilling.status.trial', 'Trial')}
                  </Badge>
                )}
              </Group>
              {!isPersonalTeam && !isTeamLeader && (
                <Text size="sm" c="dimmed" mb="xs">
                  {t('settings.planBilling.team.managedByTeam', 'Managed by team')}
                </Text>
              )}
              {!isPersonalTeam && isTeamLeader && currentTeam && (
                <Text size="sm" c="dimmed" mb="xs">
                  {t('settings.planBilling.team.memberCount', '{{count}} team members', { count: currentTeam.seatsUsed })}
                </Text>
              )}
              <Text size="sm" c="dimmed" mb="xs">
                {getDescription()}
              </Text>
              {/* Show overage cost if applicable */}
              {usage && usage.currentPeriodCredits > 0 && (
                <Text size="sm" c="orange" fw={500}>
                  {formatOverageCost(usage.estimatedCost, usage.currentPeriodCredits)}
                </Text>
              )}
            </div>

            {/* Right side: Price */}
            <div style={{ textAlign: 'right' }}>
              {!isPersonalTeam && !isTeamLeader ? (
                <Text size="lg" c="dimmed">
                  {t('settings.planBilling.team.managedByTeam', 'Managed by team')}
                </Text>
              ) : (
                <Text size="xl" fw={700}>
                  {getPriceDisplay()}
                </Text>
              )}
            </div>
          </Group>

          {/* Next billing date at bottom */}
          {subscription?.currentPeriodEnd && (
            <Group gap="xs" mt="xs">
              <Text size="sm" c="dimmed">
                {t('settings.planBilling.billing.nextBillingDate', 'Next billing date:')} {formatDate(subscription.currentPeriodEnd)}
              </Text>
            </Group>
          )}
        </Stack>
      </Card>
    );
  }

  // Free plan card
  return (
    <Card padding="lg" radius="md" withBorder>
      <Group justify="space-between" align="center">
        <div>
          <Group gap="xs">
            <Text size="lg" fw={600}>
              {getTierName()}
            </Text>
          </Group>
          <Text size="sm" c="dimmed">
            {getDescription()}
          </Text>
        </div>
        <div style={{ textAlign: 'right' }}>
          <Text size="xl" fw={700}>
            {getPriceDisplay()}
          </Text>
        </div>
      </Group>
    </Card>
  );
}
