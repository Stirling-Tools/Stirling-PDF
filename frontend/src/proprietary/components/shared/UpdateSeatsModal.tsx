import React, { useState, useEffect } from 'react';
import { Modal, Button, Text, Alert, Loader, Stack, Group, NumberInput } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { Z_INDEX_OVER_CONFIG_MODAL } from '@app/styles/zIndex';

interface UpdateSeatsModalProps {
  opened: boolean;
  onClose: () => void;
  currentSeats: number;
  minimumSeats: number;
  _onSuccess?: () => void;
  onError?: (error: string) => void;
  onUpdateSeats?: (newSeats: number) => Promise<string>; // Returns billing portal URL
}

type UpdateState = {
  status: 'idle' | 'loading' | 'error';
  error?: string;
};

const UpdateSeatsModal: React.FC<UpdateSeatsModalProps> = ({
  opened,
  onClose,
  currentSeats,
  minimumSeats,
  _onSuccess,
  onError,
  onUpdateSeats,
}) => {
  const { t } = useTranslation();
  const [state, setState] = useState<UpdateState>({ status: 'idle' });
  const [newSeatCount, setNewSeatCount] = useState<number>(minimumSeats);

  // Reset seat count when modal opens
  useEffect(() => {
    if (opened) {
      setNewSeatCount(minimumSeats);
      setState({ status: 'idle' });
    }
  }, [opened, minimumSeats]);

  const handleUpdateSeats = async () => {
    if (!onUpdateSeats) {
      setState({
        status: 'error',
        error: 'Update function not provided',
      });
      return;
    }

    if (newSeatCount < minimumSeats) {
      setState({
        status: 'error',
        error: t(
          'billing.seatCountTooLow',
          'Seat count must be at least {{minimum}} (current number of users)',
          { minimum: minimumSeats }
        ),
      });
      return;
    }

    if (newSeatCount === currentSeats) {
      setState({
        status: 'error',
        error: t('billing.seatCountUnchanged', 'Please select a different seat count'),
      });
      return;
    }

    try {
      setState({ status: 'loading' });

      // Call the update function (will call manage-billing)
      const portalUrl = await onUpdateSeats(newSeatCount);

      // Redirect to Stripe billing portal
      console.log('Redirecting to Stripe billing portal:', portalUrl);
      window.location.href = portalUrl;

      // Note: No need to call onSuccess here since we're redirecting
      // The return flow will handle success notification
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to update seat count';
      setState({
        status: 'error',
        error: errorMessage,
      });
      onError?.(errorMessage);
    }
  };

  const handleClose = () => {
    setState({ status: 'idle' });
    setNewSeatCount(currentSeats);
    onClose();
  };

  const renderContent = () => {
    if (state.status === 'loading') {
      return (
        <Stack align="center" justify="center" style={{ padding: '2rem 0' }}>
          <Loader size="lg" />
          <Text size="sm" c="dimmed" mt="md">
            {t('billing.preparingUpdate', 'Preparing seat update...')}
          </Text>
        </Stack>
      );
    }

    return (
      <Stack gap="lg">
        {state.status === 'error' && (
          <Alert color="red" title={t('common.error', 'Error')}>
            {state.error}
          </Alert>
        )}

        <Stack gap="md" mt="md">
          <Group justify="space-between">
            <Text size="sm" fw={500}>
              {t('billing.currentSeats', 'Current Seats')}:
            </Text>
            <Text size="sm" fw={600}>
              {currentSeats}
            </Text>
          </Group>
          <Group justify="space-between">
            <Text size="sm" fw={500}>
              {t('billing.minimumSeats', 'Minimum Seats')}:
            </Text>
            <Text size="sm" c="dimmed">
              {minimumSeats} {t('billing.basedOnUsers', '(current users)')}
            </Text>
          </Group>
        </Stack>

        <NumberInput
          label={t('billing.newSeatCount', 'New Seat Count')}
          description={t(
            'billing.newSeatCountDescription',
            'Select the number of seats for your enterprise license'
          )}
          value={newSeatCount}
          onChange={(value) => setNewSeatCount(typeof value === 'number' ? value : minimumSeats)}
          min={minimumSeats}
          max={10000}
          step={1}
          size="md"
          styles={{
            input: {
              fontSize: '1.5rem',
              fontWeight: 500,
              textAlign: 'center',
            },
          }}
        />

        <Alert color="blue" title={t('billing.whatHappensNext', 'What happens next?')}>
          <Text size="sm">
            {t(
              'billing.stripePortalRedirect',
              'You will be redirected to Stripe\'s billing portal to review and confirm the seat change. The prorated amount will be calculated automatically.'
            )}
          </Text>
        </Alert>

        <Group justify="flex-end" gap="sm">
          <Button variant="outline" onClick={handleClose}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button
            onClick={handleUpdateSeats}
            disabled={newSeatCount === currentSeats || newSeatCount < minimumSeats}
          >
            {t('billing.updateSeats', 'Update Seats')}
          </Button>
        </Group>
      </Stack>
    );
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={
        <Text fw={600} size="lg">
          {t('billing.updateEnterpriseSeats', 'Update Enterprise Seats')}
        </Text>
      }
      size="md"
      centered
      withCloseButton={true}
      closeOnEscape={true}
      closeOnClickOutside={false}
      zIndex={Z_INDEX_OVER_CONFIG_MODAL}
    >
      {renderContent()}
    </Modal>
  );
};

export default UpdateSeatsModal;
