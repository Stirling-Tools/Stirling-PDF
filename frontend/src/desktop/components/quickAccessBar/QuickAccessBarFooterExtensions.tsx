import { useEffect, useState } from 'react';
import { Box, Text, Button, Group } from '@mantine/core';
import { useSaaSBilling } from '@app/contexts/SaasBillingContext';
import { useSaaSTeam } from '@app/contexts/SaaSTeamContext';
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
  const { creditBalance, loading } = useSaaSBilling();
  const { isManagedTeamMember } = useSaaSTeam();
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

  const isExhausted = creditBalance <= 0;
  const textColor = isExhausted ? 'red' : 'orange';

  const handleClick = () => {
    // Dispatch low credits event to open upgrade modal
    window.dispatchEvent(new CustomEvent(CREDIT_EVENTS.LOW, {
      detail: { source: 'quickAccessBar' }
    }));
  };

  return (
    <Box className={className} style={{ padding: '0.5rem', cursor: 'pointer' }} onClick={handleClick}>
      <Group gap="xs" justify="center">
        <Text size="xs" c={textColor} fw={500}>
          {creditBalance} {creditBalance === 1 ? 'credit' : 'credits'}
        </Text>
        <Button
          variant="subtle"
          size="xs"
          compact
          style={{
            fontSize: '0.65rem',
            padding: '0.125rem 0.5rem',
            height: 'auto',
            minHeight: 'auto',
          }}
          onClick={(e) => {
            e.stopPropagation();
            handleClick();
          }}
        >
          Upgrade
        </Button>
      </Group>
    </Box>
  );
}
