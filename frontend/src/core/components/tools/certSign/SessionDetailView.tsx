import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Stack,
  Paper,
  Text,
  Group,
  Badge,
  Button,
  List,
  ActionIcon,
  Divider,
  Alert,
  Modal,
} from '@mantine/core';
import { alert } from '@app/components/toast';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PendingIcon from '@mui/icons-material/Pending';
import CancelIcon from '@mui/icons-material/Cancel';
import AddIcon from '@mui/icons-material/Add';
import InfoIcon from '@mui/icons-material/Info';
import { SessionDetail } from '@app/types/signingSession';
import UserSelector from '@app/components/tools/certSign/UserSelector';
import SignatureSettingsInput, { SignatureSettings } from '@app/components/tools/certSign/SignatureSettingsInput';

interface SessionDetailViewProps {
  session: SessionDetail;
  onFinalize: () => Promise<void>;
  onDelete: () => Promise<void>;
  onAddParticipants: (participants: { participantUserIds: number[] }) => Promise<void>;
  onRemoveParticipant: (userId: number) => Promise<void>;
  onLoadSignedPdf?: () => Promise<void>;
  onBack: () => void;
  onRefresh: () => void;
}

const SessionDetailView = ({
  session,
  onFinalize,
  onDelete,
  onAddParticipants,
  onRemoveParticipant,
  onLoadSignedPdf,
  onBack,
  onRefresh,
}: SessionDetailViewProps) => {
  const { t } = useTranslation();
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [signatureSettings, setSignatureSettings] = useState<SignatureSettings>({
    showSignature: false,
    pageNumber: 1,
    reason: '',
    location: '',
    showLogo: false,
  });
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(false);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!session.finalized) {
      const interval = setInterval(() => {
        onRefresh();
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [session.finalized, onRefresh]);

  const handleAddParticipants = async () => {
    if (selectedUserIds.length === 0) return;

    try {
      await onAddParticipants({ participantUserIds: selectedUserIds });
      setSelectedUserIds([]);
      alert({
        alertType: 'success',
        title: t('success'),
        body: t('certSign.collab.sessionDetail.participantsAdded', 'Participants added successfully'),
      });
    } catch (_error) {
      alert({
        alertType: 'error',
        title: t('error'),
        body: t('certSign.collab.sessionDetail.addParticipantsError', 'Failed to add participants'),
      });
    }
  };

  const handleRemoveParticipant = async (userId: number) => {
    try {
      await onRemoveParticipant(userId);
      alert({
        alertType: 'success',
        title: t('success'),
        body: t('certSign.collab.sessionDetail.participantRemoved', 'Participant removed'),
      });
    } catch (_error) {
      alert({
        alertType: 'error',
        title: t('error'),
        body: t('certSign.collab.sessionDetail.removeParticipantError', 'Failed to remove participant'),
      });
    }
  };

  const handleFinalize = async () => {
    setFinalizing(true);
    try {
      await onFinalize();
    } catch (_error) {
      alert({
        alertType: 'error',
        title: t('error'),
        body: t('certSign.collab.sessionDetail.finalizeError', 'Failed to finalize session'),
      });
    } finally {
      setFinalizing(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDelete();
      setDeleteModalOpen(false);
      alert({
        alertType: 'success',
        title: t('success'),
        body: t('certSign.collab.sessionDetail.deleted', 'Session deleted'),
      });
    } catch (_error) {
      alert({
        alertType: 'error',
        title: t('error'),
        body: t('certSign.collab.sessionDetail.deleteError', 'Failed to delete session'),
      });
      setDeleting(false);
    }
  };

  const handleLoadSignedPdf = async () => {
    if (!onLoadSignedPdf) return;
    setLoadingPdf(true);
    try {
      await onLoadSignedPdf();
    } catch (_error) {
      alert({
        alertType: 'error',
        title: t('error'),
        body: t('certSign.collab.sessionDetail.loadPdfError', 'Failed to load signed PDF'),
      });
    } finally {
      setLoadingPdf(false);
    }
  };

  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Button leftSection={<ArrowBackIcon />} variant="subtle" onClick={onBack} size="sm">
          {t('certSign.collab.sessionDetail.backToList', 'Back to Sessions')}
        </Button>
        {!session.finalized && (
          <Button leftSection={<DeleteIcon />} color="red" variant="outline" onClick={() => setDeleteModalOpen(true)} size="sm">
            {t('certSign.collab.sessionDetail.deleteSession', 'Delete Session')}
          </Button>
        )}
      </Group>

      <Paper p="sm" withBorder>
        <Stack gap={4}>
          <Text size="md" fw={700}>
            {session.documentName}
          </Text>
          <Group gap="sm">
            <Badge size="sm" color={session.finalized ? 'green' : 'blue'} variant="light">
              {session.finalized
                ? t('certSign.collab.sessionList.finalized', 'Finalized')
                : t('certSign.collab.sessionList.active', 'Active')}
            </Badge>
            <Text size="xs" c="dimmed">
              {new Date(session.createdAt).toLocaleDateString()}
            </Text>
          </Group>
          {session.ownerEmail && (
            <Text size="xs" c="dimmed">
              {t('certSign.collab.sessionDetail.owner', 'Owner')}: {session.ownerEmail}
            </Text>
          )}
          {session.dueDate && (
            <Text size="xs" c="dimmed">
              {t('certSign.collab.sessionDetail.dueDate', 'Due Date')}: {session.dueDate}
            </Text>
          )}
          {session.message && (
            <Text size="xs" c="dimmed">
              {t('certSign.collab.sessionDetail.messageLabel', 'Message')}: {session.message}
            </Text>
          )}
        </Stack>
      </Paper>

      <Paper p="sm" withBorder>
        <Stack gap="sm">
          <Text size="sm" fw={600}>
            {t('certSign.collab.sessionDetail.participants', 'Participants')}
          </Text>

          <List spacing={4} size="sm">
            {session.participants.map((participant) => {
              const isSigned = participant.status === 'SIGNED';
              const isDeclined = participant.status === 'DECLINED';
              const getIcon = () => {
                if (isSigned) return <CheckCircleIcon style={{ color: 'green', fontSize: '1rem' }} />;
                if (isDeclined) return <CancelIcon style={{ color: 'red', fontSize: '1rem' }} />;
                return <PendingIcon style={{ color: 'orange', fontSize: '1rem' }} />;
              };
              const getColor = () => {
                if (isSigned) return 'green';
                if (isDeclined) return 'red';
                return 'orange';
              };

              return (
                <List.Item key={participant.userId} icon={getIcon()}>
                  <Group justify="space-between" wrap="nowrap" gap={4}>
                    <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                      <Text size="xs" truncate>
                        {participant.displayName}
                        <Text span size="xs" c="dimmed" ml={4}>
                          (@{participant.username})
                        </Text>
                      </Text>
                      <Badge size="xs" color={getColor()} variant="light">
                        {t(`certSign.collab.status.${participant.status.toLowerCase()}`, participant.status)}
                      </Badge>
                    </Stack>
                    {!session.finalized && !isSigned && !isDeclined && (
                      <ActionIcon
                        size="xs"
                        variant="subtle"
                        color="red"
                        onClick={() => handleRemoveParticipant(participant.userId)}
                        title={t('certSign.collab.sessionDetail.removeParticipant', 'Remove')}
                      >
                        <DeleteIcon style={{ fontSize: '0.875rem' }} />
                      </ActionIcon>
                    )}
                  </Group>
                </List.Item>
              );
            })}
          </List>

          {!session.finalized && (
            <>
              <Divider />
              <Text size="xs" fw={600}>
                {t('certSign.collab.sessionDetail.addParticipants', 'Add Participants')}
              </Text>
              <UserSelector
                value={selectedUserIds}
                onChange={setSelectedUserIds}
                placeholder={t('certSign.collab.sessionDetail.selectUsers', 'Select users...')}
                size="xs"
              />
              <SignatureSettingsInput value={signatureSettings} onChange={setSignatureSettings} />
              <Button
                leftSection={<AddIcon />}
                onClick={handleAddParticipants}
                disabled={selectedUserIds.length === 0}
                size="xs"
              >
                {t('certSign.collab.sessionDetail.addButton', 'Add Participants')}
              </Button>
            </>
          )}
        </Stack>
      </Paper>

      {!session.finalized ? (
        <>
          <Alert icon={<InfoIcon />} color="blue" variant="light" p="xs">
            <Text size="xs">
              {t(
                'certSign.collab.sessionDetail.autoRefresh',
                'Auto-refreshing every 30s to show latest participant status'
              )}
            </Text>
          </Alert>
          <Button
            leftSection={<CheckCircleIcon />}
            size="sm"
            color="green"
            fullWidth
            onClick={handleFinalize}
            loading={finalizing}
          >
            {t('certSign.collab.finalize.button', 'Finalize and load signed PDF')}
          </Button>
        </>
      ) : (
        onLoadSignedPdf && (
          <Button
            leftSection={<CheckCircleIcon />}
            size="sm"
            color="blue"
            fullWidth
            onClick={handleLoadSignedPdf}
            loading={loadingPdf}
          >
            {t('certSign.collab.sessionDetail.loadSignedPdf', 'Load signed PDF into active files')}
          </Button>
        )
      )}

      <Modal
        opened={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title={t('certSign.collab.sessionDetail.deleteSession', 'Delete Session')}
      >
        <Stack gap="md">
          <Text>{t('certSign.collab.sessionDetail.deleteConfirm', 'Are you sure? This cannot be undone.')}</Text>
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setDeleteModalOpen(false)}>
              {t('cancel', 'Cancel')}
            </Button>
            <Button color="red" onClick={handleDelete} loading={deleting}>
              {t('delete', 'Delete')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
};

export default SessionDetailView;
