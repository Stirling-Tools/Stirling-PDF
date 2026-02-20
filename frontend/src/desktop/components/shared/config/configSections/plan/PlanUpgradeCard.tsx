import React from 'react';
import { Card, Text, Button, Stack, List, ThemeIcon } from '@mantine/core';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { useTranslation } from 'react-i18next';
import { open as shellOpen } from '@tauri-apps/plugin-shell';
import { STIRLING_SAAS_URL } from '@app/constants/connection';
import { BILLING_CONFIG } from '@app/config/billing';
import type { TierLevel } from '@app/types/billing';

interface PlanUpgradeCardProps {
  currentTier: TierLevel;
}

export function PlanUpgradeCard({ currentTier }: PlanUpgradeCardProps) {
  const { t } = useTranslation();

  // Don't show upgrade card if already on Team or Enterprise
  if (currentTier !== 'free') {
    return null;
  }

  const handleUpgrade = async () => {
    // For MVP, direct to web SaaS for upgrades
    const upgradeUrl = `${STIRLING_SAAS_URL}/account?tab=plan`;

    try {
      await shellOpen(upgradeUrl);
    } catch (error) {
      console.error('[PlanUpgradeCard] Failed to open upgrade URL:', error);
    }
  };

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Stack gap="md">
        {/* Header */}
        <Text size="lg" fw={600}>
          {t('settings.planBilling.upgrade.title', 'Upgrade Your Plan')}
        </Text>

        {/* Team plan benefits */}
        <Text size="sm" c="dimmed">
          {t('settings.planBilling.upgrade.subtitle', 'Upgrade to Team for:')}
        </Text>

        <List
          spacing="xs"
          size="sm"
          icon={
            <ThemeIcon color="blue" size={20} radius="xl">
              <CheckCircleIcon sx={{ fontSize: 12 }} />
            </ThemeIcon>
          }
        >
          <List.Item>
            {t('settings.planBilling.upgrade.featureCredits', {
              teamCredits: BILLING_CONFIG.INCLUDED_CREDITS_PER_MONTH,
              freeCredits: BILLING_CONFIG.FREE_CREDITS_PER_MONTH,
              defaultValue: `${BILLING_CONFIG.INCLUDED_CREDITS_PER_MONTH} credits per month (vs ${BILLING_CONFIG.FREE_CREDITS_PER_MONTH} on Free)`,
            })}
          </List.Item>
          <List.Item>{t('settings.planBilling.upgrade.featureMembers', 'Unlimited team members')}</List.Item>
          <List.Item>{t('settings.planBilling.upgrade.featureThroughput', 'Faster processing throughput')}</List.Item>
          <List.Item>{t('settings.planBilling.upgrade.featureApi', 'API access for automation')}</List.Item>
          <List.Item>{t('settings.planBilling.upgrade.featureSupport', 'Priority support')}</List.Item>
        </List>

        {/* Upgrade button */}
        <Button variant="filled" fullWidth onClick={handleUpgrade}>
          {t('settings.planBilling.upgrade.cta', 'Upgrade to Team')}
        </Button>

        <Text size="xs" c="dimmed" ta="center">
          {t('settings.planBilling.upgrade.opensInBrowser', 'Opens in browser to complete upgrade')}
        </Text>
      </Stack>
    </Card>
  );
}
