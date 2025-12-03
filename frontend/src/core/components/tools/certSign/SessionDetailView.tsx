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
  TagsInput,
} from '@mantine/core';
import { alert } from '@app/components/toast';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PendingIcon from '@mui/icons-material/Pending';
import PersonIcon from '@mui/icons-material/Person';
import AddIcon from '@mui/icons-material/Add';
import InfoIcon from '@mui/icons-material/Info';
import { SessionDetail } from '@app/types/signingSession';

interface SessionDetailViewProps {
  session: SessionDetail;
  onFinalize: () => Promise<void>;
  onDelete: () => Promise<void>;
  onAddParticipants: (participants: { participantEmails: string[]; participantNames?: string[] }) => Promise<void>;
  onRemoveParticipant: (email: string) => Promise<void>;
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
  const [newEmails, setNewEmails] = useState<string[]>([]);
  const [newNames, setNewNames] = useState<string[]>([]);
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

  const handleCopyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    alert({
      alertType: 'success',
      title: t('success'),
      body: t('certSign.collab.sessionDetail.linkCopied', 'Participant link copied to clipboard'),
    });
  };

  const handleAddParticipants = async () => {
    if (newEmails.length === 0) return;

    try {
      await onAddParticipants({ participantEmails: newEmails, participantNames: newNames });
      setNewEmails([]);
      setNewNames([]);
      alert({
        alertType: 'success',
        title: t('success'),
        body: t('certSign.collab.sessionDetail.participantsAdded', 'Participants added successfully'),
      });
    } catch (error) {
      alert({
        alertType: 'error',
        title: t('error'),
        body: t('certSign.collab.sessionDetail.addParticipantsError', 'Failed to add participants'),
      });
    }
  };

  const handleRemoveParticipant = async (email: string) => {
    try {
      await onRemoveParticipant(email);
      alert({
        alertType: 'success',
        title: t('success'),
        body: t('certSign.collab.sessionDetail.participantRemoved', 'Participant removed'),
      });
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
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
              return (
                <List.Item
                  key={participant.email}
                  icon={
                    isSigned ? (
                      <CheckCircleIcon style={{ color: 'green', fontSize: '1rem' }} />
                    ) : (
                      <PendingIcon style={{ color: 'orange', fontSize: '1rem' }} />
                    )
                  }
                >
                  <Group justify="space-between" wrap="nowrap" gap={4}>
                    <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                      <Text size="xs" truncate>
                        {participant.name || participant.email}
                        {participant.name && (
                          <Text span size="xs" c="dimmed" ml={4}>
                            ({participant.email})
                          </Text>
                        )}
                      </Text>
                      <Badge size="xs" color={isSigned ? 'green' : 'orange'} variant="light">
                        {t(`certSign.collab.status.${participant.status.toLowerCase()}`, participant.status)}
                      </Badge>
                    </Stack>
                    {!session.finalized && (
                      <Group gap={4}>
                        <ActionIcon
                          size="xs"
                          variant="subtle"
                          onClick={() => handleCopyLink(participant.participantUrl)}
                          title={t('certSign.collab.sessionDetail.copyLink', 'Copy link')}
                        >
                          <ContentCopyIcon style={{ fontSize: '0.875rem' }} />
                        </ActionIcon>
                        {!isSigned && (
                          <ActionIcon
                            size="xs"
                            variant="subtle"
                            color="red"
                            onClick={() => handleRemoveParticipant(participant.email)}
                            title={t('certSign.collab.sessionDetail.removeParticipant', 'Remove')}
                          >
                            <DeleteIcon style={{ fontSize: '0.875rem' }} />
                          </ActionIcon>
                        )}
                      </Group>
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
              <TagsInput
                placeholder={t(
                  'certSign.collab.sessionDetail.addParticipantsEmails',
                  'Enter email and press Enter'
                )}
                value={newEmails}
                onChange={setNewEmails}
                size="xs"
                splitChars={[',', ' ']}
                clearable
                acceptValueOnBlur
              />
              <TagsInput
                placeholder={t(
                  'certSign.collab.sessionDetail.addParticipantsNames',
                  'Enter name and press Enter (optional)'
                )}
                value={newNames}
                onChange={setNewNames}
                size="xs"
                splitChars={[',']}
                clearable
                acceptValueOnBlur
              />
              <Button leftSection={<AddIcon />} onClick={handleAddParticipants} disabled={newEmails.length === 0} size="xs">
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
