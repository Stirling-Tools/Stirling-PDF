import { useEffect, useState } from 'react';
import { Box, Text, Stack } from '@mantine/core';
import { useSaaSBilling } from '@app/contexts/SaasBillingContext';
import { connectionModeService } from '@app/services/connectionModeService';
import { authService } from '@app/services/authService';
import { CREDIT_EVENTS } from '@app/constants/creditEvents';

/**
 * Desktop credit counter displayed in QuickAccessBar footer
 * Shows when user is in SaaS mode with low credits (<20)
 */

interface QuickAccessBarFooterExtensionsProps {
  className?: string;
}

export function QuickAccessBarFooterExtensions({ className }: QuickAccessBarFooterExtensionsProps) {
  const { creditBalance, loading, isManagedTeamMember } = useSaaSBilling();
  const [isSaasMode, setIsSaasMode] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Check connection mode and authentication status
  useEffect(() => {
    const checkMode = async () => {
      const mode = await connectionModeService.getCurrentMode();
      const auth = await authService.isAuthenticated();
      setIsSaasMode(mode === 'saas');
      setIsAuthenticated(auth);
    };

    checkMode();

    // Subscribe to mode changes
    const unsubscribe = connectionModeService.subscribeToModeChanges(checkMode);
    return unsubscribe;
  }, []);

  // Subscribe to auth changes
  useEffect(() => {
    const unsubscribe = authService.subscribeToAuth((status) => {
      setIsAuthenticated(status === 'authenticated');
    });
    return unsubscribe;
  }, []);

  // Don't show credit counter if:
  // - Not in SaaS mode
  // - Not authenticated
  // - Still loading billing data
  // - User is a managed team member (unlimited credits)
  // - Credits >= 20 (only show when low)
  if (!isSaasMode || !isAuthenticated || loading || isManagedTeamMember || creditBalance >= 20) {
    return null;
  }

  const handleClick = () => {
    // Dispatch low credits event to open upgrade modal
    window.dispatchEvent(new CustomEvent(CREDIT_EVENTS.LOW, {
      detail: { source: 'quickAccessBar' }
    }));
  };

  return (
    <Box className={className} style={{ padding: '0.5rem', cursor: 'pointer' }} onClick={handleClick}>
      <Stack gap={2} align="center">
        <Text size="xs" c="dimmed" fw={500}>
          {creditBalance} {creditBalance === 1 ? 'credit' : 'credits'}
        </Text>
        <Text size="xs" c="dimmed" style={{ textDecoration: 'underline' }}>
          Upgrade
        </Text>
      </Stack>
    </Box>
  );
}
