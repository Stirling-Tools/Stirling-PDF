import React, { useState, useEffect } from 'react';
import { Group, Text, Button, ActionIcon, Paper } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@app/auth/UseSession';
import { useCheckout } from '@app/contexts/CheckoutContext';
import { useLicense } from '@app/contexts/LicenseContext';
import { mapLicenseToTier } from '@app/services/licenseService';
import LocalIcon from '@app/components/shared/LocalIcon';

/**
 * UpgradeBanner - Dismissable top banner encouraging users to upgrade
 *
 * This component demonstrates:
 * - How to check authentication status with useAuth()
 * - How to check license status with licenseService
 * - How to open checkout modal with useCheckout()
 * - How to persist dismissal state with localStorage
 *
 * To remove this banner:
 * 1. Remove the import and component from AppProviders.tsx
 * 2. Delete this file
 */
const UpgradeBanner: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { openCheckout } = useCheckout();
  const { licenseInfo, loading: licenseLoading } = useLicense();
  const [isVisible, setIsVisible] = useState(false);

  // Check if user should see the banner
  useEffect(() => {
    // Don't show if not logged in
    if (!user) {
      setIsVisible(false);
      return;
    }

    // Don't show while license is loading
    if (licenseLoading) {
      return;
    }

    // Check if banner was dismissed
    const dismissed = localStorage.getItem('upgradeBannerDismissed');
    if (dismissed === 'true') {
      setIsVisible(false);
      return;
    }

    // Check license status from global context
    const tier = mapLicenseToTier(licenseInfo);

    // Show banner only for free tier users
    if (tier === 'free' || tier === null) {
      setIsVisible(true);
    } else {
      // Auto-hide banner if user upgrades
      setIsVisible(false);
    }
  }, [user, licenseInfo, licenseLoading]);

  // Handle dismiss
  const handleDismiss = () => {
    localStorage.setItem('upgradeBannerDismissed', 'true');
    setIsVisible(false);
  };

  // Handle upgrade button click
  const handleUpgrade = () => {
    openCheckout('server', {
      currency: 'gbp',
      minimumSeats: 1,
      onSuccess: () => {
        // Banner will auto-hide on next render when license is detected
        setIsVisible(false);
      },
    });
  };

  // Don't render anything if loading or not visible
  if (licenseLoading || !isVisible) {
    return null;
  }

  return (
    <Paper
      shadow="sm"
      p="md"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        borderRadius: 0,
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
      }}
    >
      <Group justify="space-between" wrap="nowrap">
        <Group gap="md" wrap="nowrap">
          <LocalIcon icon="stars-rounded" width="1.5rem" height="1.5rem" />
          <div>
            <Text size="sm" fw={600}>
              {t('upgradeBanner.title', 'Upgrade to Server Plan')}
            </Text>
            <Text size="xs" opacity={0.9}>
              {t('upgradeBanner.message', 'Get the most out of Stirling PDF with unlimited users and advanced features')}
            </Text>
          </div>
        </Group>

        <Group gap="xs" wrap="nowrap">
          <Button
            variant="white"
            size="sm"
            onClick={handleUpgrade}
            leftSection={<LocalIcon icon="upgrade-rounded" width="1rem" height="1rem" />}
          >
            {t('upgradeBanner.upgradeButton', 'Upgrade Now')}
          </Button>
          <ActionIcon
            variant="subtle"
            color="white"
            size="lg"
            onClick={handleDismiss}
            aria-label={t('upgradeBanner.dismiss', 'Dismiss banner')}
          >
            <LocalIcon icon="close-rounded" width="1.25rem" height="1.25rem" />
          </ActionIcon>
        </Group>
      </Group>
    </Paper>
  );
};

export default UpgradeBanner;
