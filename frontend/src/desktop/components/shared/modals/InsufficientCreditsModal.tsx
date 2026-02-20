import { useState } from 'react';
import { Modal, Stack, Text, Button, Alert, Group } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useSaaSBilling } from '@app/contexts/SaasBillingContext';
import { useSaaSTeam } from '@app/contexts/SaaSTeamContext';
import { Z_INDEX_OVER_CONFIG_MODAL } from '@app/styles/zIndex';
import { useSaaSCheckout } from '@app/contexts/SaaSCheckoutContext';
import WarningIcon from '@mui/icons-material/Warning';
import { supabase } from '@app/auth/supabase';

interface InsufficientCreditsModalProps {
  opened: boolean;
  onClose: () => void;
  toolId?: string;
  requiredCredits?: number;
}

/**
 * Desktop Insufficient Credits Modal
 * Shows when user attempts operation without enough credits
 */
export function InsufficientCreditsModal({
  opened,
  onClose,
  toolId,
  requiredCredits,
}: InsufficientCreditsModalProps) {
  const { t } = useTranslation();
  const { creditBalance, tier, refreshBilling } = useSaaSBilling();
  const { isManagedTeamMember, isTeamLeader } = useSaaSTeam();
  const { openCheckout } = useSaaSCheckout();

  // State for enabling metered billing
  const [enablingMetering, setEnablingMetering] = useState(false);
  const [meteringError, setMeteringError] = useState<string | null>(null);

  const toolName = toolId ? t(`tool.${toolId}.name`, toolId) : t('common.operation', 'this operation');

  const handleEnableMetering = async () => {
    console.debug('[InsufficientCredits] Enabling metered billing');
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

      console.debug('[InsufficientCredits] ✅ Metered billing enabled successfully');

      // Refresh billing status
      await refreshBilling();

      // Close modal
      onClose();
    } catch (err: any) {
      console.error('[InsufficientCredits] Failed to enable metered billing:', err);
      setMeteringError(err.message || 'Failed to enable metered billing');
    } finally {
      setEnablingMetering(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      withCloseButton
      centered
      size="md"
      zIndex={Z_INDEX_OVER_CONFIG_MODAL}
      title={
        <Group gap="xs">
          <WarningIcon sx={{ fontSize: 24, color: 'var(--mantine-color-orange-6)' }} />
          <Text size="lg" fw={500}>
            {t('credits.insufficient.title', 'Insufficient Credits')}
          </Text>
        </Group>
      }
    >
      <Stack gap="md">
        <Alert color="orange" icon={<WarningIcon />}>
          <Text size="sm">
            {requiredCredits
              ? t(
                  'credits.insufficient.messageWithAmount',
                  'You need {{required}} credits to run {{tool}}, but you only have {{current}}.',
                  {
                    required: requiredCredits,
                    tool: toolName,
                    current: creditBalance,
                  }
                )
              : t(
                  'credits.insufficient.message',
                  'You do not have enough credits to run {{tool}}. You currently have {{current}} credits.',
                  {
                    tool: toolName,
                    current: creditBalance,
                  }
                )}
          </Text>
        </Alert>

        {isManagedTeamMember ? (
          <>
            <Text size="sm" c="dimmed">
              {t(
                'credits.insufficient.managedMember',
                'Please contact your team leader for assistance.'
              )}
            </Text>
            <Button onClick={onClose} fullWidth>
              {t('common.close', 'Close')}
            </Button>
          </>
        ) : tier === 'team' ? (
          <>
            <Text size="sm" c="dimmed">
              {t(
                'credits.insufficient.teamMember',
                'Enable overage billing to never run out of credits.'
              )}
            </Text>
            {meteringError && (
              <Alert color="red">
                {meteringError}
              </Alert>
            )}
            <Button
              variant="filled"
              color="blue"
              fullWidth
              onClick={handleEnableMetering}
              loading={enablingMetering}
              disabled={!isTeamLeader}
            >
              {t('credits.enableOverageBilling', 'Enable Overage Billing')}
            </Button>
            {!isTeamLeader && (
              <Text size="xs" c="dimmed" ta="center">
                {t('credits.modal.teamLeaderOnly', 'Only team leaders can enable overage billing')}
              </Text>
            )}
            <Button onClick={onClose} variant="subtle" fullWidth disabled={enablingMetering}>
              {t('common.cancel', 'Cancel')}
            </Button>
          </>
        ) : (
          <>
            <Text size="sm" c="dimmed">
              {t(
                'credits.insufficient.freeTier',
                'Upgrade to Team for 10x more credits and unlimited overage billing.'
              )}
            </Text>
            <Button
              variant="filled"
              color="blue"
              fullWidth
              onClick={() => {
                openCheckout('pro');
                onClose();
              }}
            >
              {t('credits.upgrade', 'Upgrade to Team')}
            </Button>
            <Button onClick={onClose} variant="subtle" fullWidth>
              {t('common.cancel', 'Cancel')}
            </Button>
          </>
        )}
      </Stack>
    </Modal>
  );
}
