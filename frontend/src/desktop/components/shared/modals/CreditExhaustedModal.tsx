import { useState } from 'react';
import { Modal, Stack, Card, Text, Group, Badge, Button, Alert } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import { useSaaSBilling } from '@app/contexts/SaasBillingContext';
import { useSaaSTeam } from '@app/contexts/SaaSTeamContext';
import { BILLING_CONFIG, getCurrencySymbol, getFormattedOveragePrice } from '@app/config/billing';
import { Z_INDEX_OVER_CONFIG_MODAL } from '@app/styles/zIndex';
import { CreditUsageBanner } from '@app/components/shared/modals/CreditUsageBanner';
import { FeatureListItem } from '@app/components/shared/modals/FeatureListItem';
import { FREE_PLAN_FEATURES, TEAM_PLAN_FEATURES, ENTERPRISE_PLAN_FEATURES } from '@app/config/planFeatures';
import { useSaaSCheckout } from '@app/contexts/SaaSCheckoutContext';
import { supabase } from '@app/auth/supabase';

interface CreditExhaustedModalProps {
  opened: boolean;
  onClose: () => void;
}

/**
 * Desktop Credit Exhausted Modal
 * Shows upgrade options when user runs out of credits
 * Routes to different UI based on user status (free/team/managed member)
 */
export function CreditExhaustedModal({ opened, onClose }: CreditExhaustedModalProps) {
  const { t } = useTranslation();
  const { creditBalance, tier, plans, refreshBilling } = useSaaSBilling();
  const { isManagedTeamMember, isTeamLeader } = useSaaSTeam();
  const { openCheckout } = useSaaSCheckout();

  // State for enabling metered billing
  const [enablingMetering, setEnablingMetering] = useState(false);
  const [meteringError, setMeteringError] = useState<string | null>(null);

  // Managed team members have unlimited credits via team
  if (isManagedTeamMember) {
    return (
      <Modal
        opened={opened}
        onClose={onClose}
        withCloseButton
        centered
        size="md"
        zIndex={Z_INDEX_OVER_CONFIG_MODAL}
        title={t('credits.modal.managedMemberTitle', 'Unlimited Credits')}
      >
        <Stack gap="md">
          <Text size="sm">
            {t('credits.modal.managedMemberMessage', 'You have unlimited access to credits through your team. If you need assistance, please contact your team leader.')}
          </Text>
          <Button onClick={onClose} fullWidth>
            {t('common.close', 'Close')}
          </Button>
        </Stack>
      </Modal>
    );
  }

  // Team users should enable overage billing
  // Only team leaders can enable metered billing, members see different UI
  if (tier === 'team') {
    const handleEnableMetering = async () => {
      console.debug('[CreditExhausted] Enabling metered billing');
      setEnablingMetering(true);
      setMeteringError(null);

      try {
        const { data, error } = await supabase.functions.invoke('create-meter-subscription', {
          method: 'POST'
        });

        if (error) {
          throw new Error(error.message || 'Failed to enable metered billing');
        }

        if (!data?.success) {
          throw new Error(data?.error || data?.message || 'Failed to enable metered billing');
        }

        console.debug('[CreditExhausted] ✅ Metered billing enabled successfully');

        // Refresh billing status to pick up the new flag
        await refreshBilling();

        // Close modal
        onClose();
      } catch (err: any) {
        console.error('[CreditExhausted] Failed to enable metered billing:', err);
        setMeteringError(err.message || 'Failed to enable metered billing');
      } finally {
        setEnablingMetering(false);
      }
    };

    const teamPlan = plans.get('team');
    const teamCurrency = teamPlan?.currency ?? '$';
    const overagePrice = teamPlan?.overagePrice ?? BILLING_CONFIG.OVERAGE_PRICE_PER_CREDIT;
    const formattedOveragePrice = getFormattedOveragePrice(teamCurrency, overagePrice);

    return (
      <Modal
        opened={opened}
        onClose={onClose}
        withCloseButton
        closeOnClickOutside={!enablingMetering}
        closeOnEscape={!enablingMetering}
        centered
        size="lg"
        radius="md"
        zIndex={Z_INDEX_OVER_CONFIG_MODAL}
        title={
          <Stack gap="sm">
            <Text size="lg" fw={450}>
              {t('credits.modal.titleExhaustedPro', 'You have run out of credits')}
            </Text>
            <Text size="sm" c="dimmed">
              {t('credits.modal.subtitlePro', 'Enable automatic overage billing to never run out of credits.')}
            </Text>
          </Stack>
        }
        styles={{
          body: { padding: '0rem 0rem 0.5rem 0rem' },
          content: {
            backgroundColor: 'light-dark(#FFFFFF, #1A1A1E)',
          },
          header: {
            backgroundColor: 'light-dark(#FFFFFF, #1A1A1E)',
          },
          overlay: {
            backgroundColor: 'light-dark(rgba(0,0,0,0.5), rgba(0,0,0,0.7))',
          },
        }}
      >
        <Stack gap="lg">
          <CreditUsageBanner
            currentCredits={creditBalance}
            totalCredits={BILLING_CONFIG.INCLUDED_CREDITS_PER_MONTH}
          />

          {meteringError && (
            <Alert color="red" ml="lg" mr="lg">
              {meteringError}
            </Alert>
          )}

          {/* Explanation Card */}
          <Card
            padding="xl"
            radius="md"
            withBorder
            ml="lg"
            mr="lg"
            style={{
              borderColor: 'var(--color-primary-600)',
              borderWidth: 2,
              backgroundColor: 'light-dark(#FFFFFF, #1A1A1E)',
            }}
          >
            <Stack gap="md">
              <Group gap="xs" align="center">
                <TrendingUpIcon sx={{ fontSize: 24, color: 'var(--color-primary-600)' }} />
                <Text size="lg" fw={600}>
                  {t('credits.modal.meteringTitle', 'Pay-What-You-Use Overage Billing')}
                </Text>
              </Group>

              <Text size="sm" c="dimmed">
                {t('credits.modal.meteringExplanation', 'Your Team plan includes 500 credits per month. When you run out, overage billing automatically provides additional credits so you never have to stop working.')}
              </Text>

              <Stack gap="xs">
                <FeatureListItem included>
                  {t('credits.modal.meteringIncluded', '500 credits/month included with Team')}
                </FeatureListItem>
                <FeatureListItem included>
                  {t('credits.modal.meteringPrice', 'Additional credits at {{price}}/credit', {
                    price: formattedOveragePrice,
                  })}
                </FeatureListItem>
                <FeatureListItem included>
                  {t('credits.modal.meteringPayAsYouGo', 'Only pay for what you use')}
                </FeatureListItem>
                <FeatureListItem included>
                  {t('credits.modal.meteringNoCommitment', 'No commitment, cancel anytime')}
                </FeatureListItem>
                <FeatureListItem included>
                  {t('credits.modal.meteringNeverRunOut', 'Never run out of credits')}
                </FeatureListItem>
              </Stack>

              <Card
                padding="md"
                radius="md"
                style={{
                  backgroundColor: 'light-dark(#F8F9FA, #1A1A1E)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <Text size="xs" c="dimmed">
                  {t('credits.modal.meteringBillingNote', 'Overage credits are billed monthly alongside your Team subscription. Track your usage anytime in your account settings.')}
                </Text>
              </Card>
            </Stack>
          </Card>

          {/* Action Buttons */}
          <Stack gap="sm" ml="lg" mr="lg">
            <Button
              onClick={handleEnableMetering}
              variant="filled"
              color="blue"
              fullWidth
              size="lg"
              loading={enablingMetering}
              disabled={!isTeamLeader}
              leftSection={<TrendingUpIcon sx={{ fontSize: 18 }} />}
              style={{
                fontWeight: 600,
              }}
            >
              {t('credits.enableOverageBilling', 'Enable Overage Billing')}
            </Button>
            {!isTeamLeader && (
              <Text size="xs" c="dimmed" ta="center">
                {t('credits.modal.teamLeaderOnly', 'Only team leaders can enable overage billing')}
              </Text>
            )}
            <Button onClick={onClose} variant="subtle" fullWidth size="md" c="dimmed" disabled={enablingMetering}>
              {t('credits.maybeLater', 'Maybe later')}
            </Button>
          </Stack>
        </Stack>
      </Modal>
    );
  }

  // Free tier users - show upgrade modal
  const teamPlan = plans.get('team');
  const teamPrice = teamPlan?.price ?? 20;
  const teamCurrency = teamPlan?.currency ?? '$';
  const overagePrice = teamPlan?.overagePrice ?? BILLING_CONFIG.OVERAGE_PRICE_PER_CREDIT;

  const currencySymbol = getCurrencySymbol(teamCurrency);
  const formattedOveragePrice = `${currencySymbol}${overagePrice.toFixed(2)}`;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      withCloseButton
      closeOnClickOutside
      closeOnEscape
      centered
      size="60rem"
      radius="md"
      zIndex={Z_INDEX_OVER_CONFIG_MODAL}
      title={
        <Stack gap="sm">
          <Text size="lg" fw={450}>
            {t('credits.modal.titleExhausted', "You've used your free credits")}
          </Text>
          <Text size="sm" c="dimmed">
            {t('credits.modal.subtitle', 'Upgrade to Team for 10x the credits and faster processing.')}
          </Text>
        </Stack>
      }
      styles={{
        body: { padding: '0rem 0rem 0.5rem 0rem' },
        content: {
          backgroundColor: 'light-dark(#FFFFFF, #1A1A1E)',
        },
        header: {
          backgroundColor: 'light-dark(#FFFFFF, #1A1A1E)',
        },
        overlay: {
          backgroundColor: 'light-dark(rgba(0,0,0,0.5), rgba(0,0,0,0.7))',
        },
      }}
    >
      <Stack gap="lg">
        <CreditUsageBanner
          currentCredits={creditBalance}
          totalCredits={BILLING_CONFIG.FREE_CREDITS_PER_MONTH}
        />

        <Group gap="md" ml="lg" mr="lg" align="stretch" grow>
          {/* Free Plan Card */}
          <Card
            padding="xl"
            radius="md"
            withBorder
            style={{
              borderColor: 'var(--border-default)',
              borderWidth: 1,
              opacity: 0.85,
              backgroundColor: 'light-dark(#FFFFFF, #1A1A1E)',
            }}
          >
            <Stack gap="md" style={{ height: '100%' }}>
              <div>
                <Text size="lg" fw={600} mb="xs">
                  {t('credits.modal.freeTier', 'Free Tier')}
                </Text>
                <Group gap="xs" align="baseline">
                  <Text size="1.75rem" fw={700}>
                    {currencySymbol}0
                  </Text>
                  <Text size="sm" c="dimmed">
                    {t('credits.modal.perMonth', '/month')}
                  </Text>
                </Group>
                <Text size="sm" c="dimmed" mt="xs">
                  {BILLING_CONFIG.FREE_CREDITS_PER_MONTH} {t('credits.modal.monthlyCredits', 'monthly credits')}
                </Text>
              </div>

              <Stack gap="xs" style={{ flex: 1 }}>
                <Text size="sm" fw={500} mb="xs">
                  {t('credits.modal.forRegularWork', 'For regular PDF work:')}
                </Text>
                {FREE_PLAN_FEATURES.map((feature, index) => (
                  <FeatureListItem key={index} included color="var(--mantine-color-gray-6)">
                    {t(feature.translationKey, feature.defaultText)}
                  </FeatureListItem>
                ))}
              </Stack>

              <Button
                disabled
                variant="subtle"
                fullWidth
                size="md"
                radius="lg"
                style={{
                  fontWeight: 600,
                  background: 'transparent',
                  border: 'none',
                  cursor: 'default',
                }}
              >
                {t('credits.modal.current', 'Current Plan')}
              </Button>
            </Stack>
          </Card>

          {/* Team Plan Card */}
          <Card
            padding="lg"
            radius="md"
            withBorder
            style={{
              borderColor: 'var(--card-selected-border)',
              borderWidth: 2,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              position: 'relative',
              boxShadow: '0 2px 8px rgba(59, 130, 246, 0.1)',
              overflow: 'visible',
              backgroundColor: 'light-dark(#FFFFFF, #1A1A1E)',
            }}
            onClick={() => openCheckout('pro')}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = '0 12px 48px rgba(59, 130, 246, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(59, 130, 246, 0.1)';
            }}
          >
            <Badge
              size="sm"
              style={{
                position: 'absolute',
                top: -10,
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgb(59, 130, 246)',
                color: 'white',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                paddingLeft: '12px',
                paddingRight: '12px',
              }}
            >
              {t('credits.modal.popular', 'Popular')}
            </Badge>
            <Stack gap="md" style={{ height: '100%' }}>
              <div>
                <Text size="lg" fw={600} mb="xs">
                  {t('credits.modal.teamSubscription', 'Team')}
                </Text>
                <Group gap="xs" align="baseline" mt="xs">
                  <Text size="1.75rem" fw={700} style={{ color: 'var(--text-primary)' }}>
                    {currencySymbol}
                    {teamPrice}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {t('credits.modal.perMonth', '/month')}
                  </Text>
                </Group>
                <Text size="sm" c="dimmed" mt="xs">
                  {BILLING_CONFIG.INCLUDED_CREDITS_PER_MONTH} {t('credits.modal.monthlyCredits', 'monthly credits')} + {formattedOveragePrice}/{t('credits.modal.overage', 'overage')}
                </Text>
              </div>

              <Stack gap="xs" style={{ flex: 1 }}>
                <Text size="sm" fw={500} mb="xs">
                  {t('credits.modal.everythingInFree', 'Everything in Free, plus:')}
                </Text>
                {TEAM_PLAN_FEATURES.map((feature, index) => (
                  <FeatureListItem key={index} included>
                    {t(feature.translationKey, feature.defaultText)}
                  </FeatureListItem>
                ))}
              </Stack>

              <Button
                onClick={() => openCheckout('pro')}
                variant="filled"
                color="blue"
                fullWidth
                size="md"
                radius="lg"
                style={{
                  fontWeight: 600,
                }}
              >
                {t('credits.upgrade', 'Upgrade')}
              </Button>
            </Stack>
          </Card>

          {/* Enterprise Plan Card */}
          <Card
            padding="lg"
            radius="md"
            withBorder
            style={{
              borderWidth: 1,
              backgroundColor: 'light-dark(#FFFFFF, #1A1A1E)',
            }}
          >
            <Stack gap="md" style={{ height: '100%' }}>
              <div>
                <Text size="md" fw={600} mb="xs">
                  {t('credits.modal.enterpriseSubscription', 'Enterprise')}
                </Text>
                <Text size="1.75rem" fw={600}>
                  {t('credits.modal.customPricing', 'Custom')}
                </Text>
                <Text size="sm" c="dimmed" mt="xs">
                  {t('credits.modal.unlimitedMonthlyCredits', 'Site License')}
                </Text>
              </div>

              <Stack gap="xs" style={{ flex: 1 }}>
                <Text size="sm" fw={500} mb="xs">
                  {t('credits.modal.everythingInCredits', 'Everything in Credits, plus:')}
                </Text>
                {ENTERPRISE_PLAN_FEATURES.map((feature, index) => (
                  <FeatureListItem key={index} included>
                    {t(feature.translationKey, feature.defaultText)}
                  </FeatureListItem>
                ))}
              </Stack>

              <Button
                component="a"
                href="mailto:contact@stirlingpdf.com?subject=Enterprise Plan Inquiry"
                variant="outline"
                fullWidth
                size="md"
                radius="lg"
                style={{
                  borderColor: 'var(--text-primary)',
                  color: 'var(--text-primary)',
                  fontWeight: 600,
                }}
              >
                {t('credits.modal.contactSales', 'Contact Sales')}
              </Button>
            </Stack>
          </Card>
        </Group>

        <Text size="sm" ta="center" c="dimmed" mt="md">
          Want to self host?{' '}
          <Text
            component="a"
            href="https://www.stirling.com/pricing"
            target="_blank"
            rel="noopener noreferrer"
            size="sm"
            style={{ color: 'var(--mantine-color-blue-6)', textDecoration: 'none' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.textDecoration = 'underline';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.textDecoration = 'none';
            }}
          >
            Review the docs and plans
          </Text>
        </Text>
      </Stack>
    </Modal>
  );
}
