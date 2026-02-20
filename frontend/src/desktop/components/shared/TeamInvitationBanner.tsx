import { useState, useEffect } from 'react';
import { Button, Group, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import LocalIcon from '@app/components/shared/LocalIcon';
import { InfoBanner } from '@app/components/shared/InfoBanner';
import { useSaaSTeam } from '@app/contexts/SaaSTeamContext';
import { useSaaSBilling } from '@app/contexts/SaasBillingContext';
import { connectionModeService } from '@app/services/connectionModeService';

export function TeamInvitationBanner() {
  const { t } = useTranslation();
  const { receivedInvitations, acceptInvitation, rejectInvitation } = useSaaSTeam();
  const { refreshBilling } = useSaaSBilling();

  const [processing, setProcessing] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [connectionMode, setConnectionMode] = useState<string | null>(null);

  // Load connection mode on mount
  useEffect(() => {
    connectionModeService.getCurrentMode().then(mode => setConnectionMode(mode));
  }, []);

  // Accept invitation handler
  const handleAccept = async () => {
    const invitation = receivedInvitations[0];
    if (!invitation) return;

    setProcessing(true);

    try {
      await acceptInvitation(invitation.invitationToken);
      console.log('[TeamInvitationBanner] Invitation accepted successfully:', invitation.teamName);

      // Wait briefly for backend to process team membership update
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Refresh billing after joining team (tier may have changed)
      console.log('[TeamInvitationBanner] Refreshing billing after team join...');
      await refreshBilling();

      setDismissed(true);
    } catch (error) {
      console.error('[TeamInvitationBanner] Failed to accept invitation:', error);
    } finally {
      setProcessing(false);
    }
  };

  // Reject invitation handler
  const handleReject = async () => {
    const invitation = receivedInvitations[0];
    if (!invitation) return;

    setProcessing(true);

    try {
      await rejectInvitation(invitation.invitationToken);
      console.log('[TeamInvitationBanner] Invitation rejected');
      setDismissed(true);
    } catch (error) {
      console.error('[TeamInvitationBanner] Failed to reject invitation:', error);
    } finally {
      setProcessing(false);
    }
  };

  // Visibility logic
  const shouldShow =
    connectionMode === 'saas' &&
    !dismissed &&
    receivedInvitations.length > 0;

  if (!shouldShow) return null;

  const invitation = receivedInvitations[0]; // Show first invitation

  const message = (
    <Text component="span" size="sm" fw={500} style={{ color: 'rgba(255, 255, 255, 0.95)' }}>
      <strong>{invitation.inviterEmail}</strong> {t('team.invitationBanner.message', 'has invited you to join')}{' '}
      <strong>{invitation.teamName}</strong>
    </Text>
  );

  const actionButtons = (
    <Group gap="xs" wrap="nowrap">
      <Button
        variant="white"
        color="gray"
        size="xs"
        onClick={handleAccept}
        loading={processing}
        leftSection={<LocalIcon icon="check" width="0.9rem" height="0.9rem" style={{ color: 'var(--mantine-color-dark-9)' }} />}
        styles={{
          label: {
            color: 'var(--mantine-color-dark-9)',
          },
        }}
      >
        {t('team.invitationBanner.acceptButton', 'Accept')}
      </Button>
      <Button
        variant="subtle"
        size="xs"
        onClick={handleReject}
        loading={processing}
        style={{ color: 'rgba(255, 255, 255, 0.7)' }}
      >
        {t('team.invitationBanner.rejectButton', 'Decline')}
      </Button>
    </Group>
  );

  return (
    <InfoBanner
      icon="mail"
      message={
        <Group justify="space-between" align="center" wrap="nowrap" style={{ width: '100%' }}>
          {message}
          {actionButtons}
        </Group>
      }
      show={shouldShow}
      dismissible={false}
      background="var(--mantine-color-dark-7)"
      borderColor="var(--mantine-color-dark-5)"
      textColor="rgba(255, 255, 255, 0.95)"
      iconColor="rgba(255, 255, 255, 0.95)"
    />
  );
}
