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
import UserSelector from '@app/components/shared/UserSelector';
import SignatureSettingsInput, { SignatureSettings } from '@app/components/tools/certSign/SignatureSettingsInput';
import { LocalEmbedPDF } from '@app/components/viewer/LocalEmbedPDF';

export interface SessionDetailWorkbenchData {
  session: SessionDetail;
  pdfFile: File | null;
  onFinalize: () => Promise<void>;
  onLoadSignedPdf: () => Promise<void>;
  onAddParticipants: (userIds: number[], settings: SignatureSettings) => Promise<void>;
  onRemoveParticipant: (userId: number) => Promise<void>;
  onDelete: () => Promise<void>;
  onBack: () => void;
  onRefresh: () => Promise<void>;
}

interface SessionDetailWorkbenchViewProps {
  data: SessionDetailWorkbenchData;
}

const SessionDetailWorkbenchView = ({ data }: SessionDetailWorkbenchViewProps) => {
  const { t } = useTranslation();
  const { session, pdfFile, onFinalize, onLoadSignedPdf, onAddParticipants, onRemoveParticipant, onDelete, onBack, onRefresh } = data;

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
  const [addingParticipants, setAddingParticipants] = useState(false);

  // Auto-refresh every 30 seconds when not finalized
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

    setAddingParticipants(true);
    try {
      await onAddParticipants(selectedUserIds, signatureSettings);
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
    } finally {
      setAddingParticipants(false);
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Top Control Bar */}
      <Paper p="sm" shadow="sm" style={{ flexShrink: 0, zIndex: 10 }}>
        <Group justify="space-between">
          <Group gap="md">
            <Button
              leftSection={<ArrowBackIcon />}
              variant="subtle"
              onClick={onBack}
              size="sm"
            >
              {t('certSign.collab.sessionDetail.backToList', 'Back to Sessions')}
            </Button>
            <Divider orientation="vertical" />
            <Stack gap={2}>
              <Group gap="sm">
                <Text size="sm" fw={600}>
                  {session.documentName}
                </Text>
                <Badge size="sm" color={session.finalized ? 'green' : 'blue'} variant="light">
                  {session.finalized
                    ? t('certSign.collab.sessionList.finalized', 'Finalized')
                    : t('certSign.collab.sessionList.active', 'Active')}
                </Badge>
              </Group>
              <Text size="xs" c="dimmed">
                {session.ownerEmail && `${t('certSign.collab.sessionDetail.owner', 'Owner')}: ${session.ownerEmail}`}
                {session.ownerEmail && ' • '}
                {new Date(session.createdAt).toLocaleDateString()}
              </Text>
            </Stack>
          </Group>

          {!session.finalized && (
            <Button
              leftSection={<DeleteIcon />}
              color="red"
              variant="outline"
              onClick={() => setDeleteModalOpen(true)}
              size="sm"
            >
              {t('certSign.collab.sessionDetail.deleteSession', 'Delete Session')}
            </Button>
          )}
        </Group>
      </Paper>

      {/* Main Content Area */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left Panel - Participants */}
        <Paper
          p="md"
          shadow="sm"
          style={{
            width: '280px',
            flexShrink: 0,
            overflowY: 'auto',
            borderRight: '1px solid var(--mantine-color-gray-3)'
          }}
        >
          <Stack gap="md">
            <Text size="md" fw={600}>
              {t('certSign.collab.sessionDetail.participants', 'Participants')}
            </Text>

            <List spacing={8} size="sm">
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
                          {participant.name}
                        </Text>
                        <Text size="xs" c="dimmed" truncate>
                          @{participant.email}
                        </Text>
                        <Badge size="xs" color={getColor()} variant="light">
                          {t(`certSign.collab.status.${participant.status.toLowerCase()}`, participant.status)}
                        </Badge>
                      </Stack>
                      {!session.finalized && !isSigned && !isDeclined && (
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          color="red"
                          onClick={() => handleRemoveParticipant(participant.userId)}
                          title={t('certSign.collab.sessionDetail.removeParticipant', 'Remove')}
                        >
                          <DeleteIcon style={{ fontSize: '1rem' }} />
                        </ActionIcon>
                      )}
                    </Group>
                  </List.Item>
                );
              })}
            </List>
          </Stack>
        </Paper>

        {/* Center - PDF Viewer */}
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          <LocalEmbedPDF file={pdfFile} />
        </div>

        {/* Right Panel - Session Info and Actions */}
        <Paper
          p="md"
          shadow="sm"
          style={{
            width: '320px',
            flexShrink: 0,
            overflowY: 'auto',
            borderLeft: '1px solid var(--mantine-color-gray-3)'
          }}
        >
          <Stack gap="md">
            <div>
              <Text size="md" fw={600} mb="sm">
                {t('certSign.collab.sessionDetail.sessionInfo', 'Session Info')}
              </Text>
              <Stack gap="xs">
                {session.dueDate && (
                  <Paper p="xs" withBorder>
                    <Text size="xs" fw={600} c="dimmed">
                      {t('certSign.collab.sessionDetail.dueDate', 'Due Date')}
                    </Text>
                    <Text size="xs">{session.dueDate}</Text>
                  </Paper>
                )}
                {session.message && (
                  <Paper p="xs" withBorder>
                    <Text size="xs" fw={600} c="dimmed">
                      {t('certSign.collab.sessionDetail.messageLabel', 'Message')}
                    </Text>
                    <Text size="xs">{session.message}</Text>
                  </Paper>
                )}
              </Stack>
            </div>

            {!session.finalized && (
              <>
                <Divider />
                <div>
                  <Text size="md" fw={600} mb="sm">
                    {t('certSign.collab.sessionDetail.addParticipants', 'Add Participants')}
                  </Text>
                  <Stack gap="sm">
                    <UserSelector
                      value={selectedUserIds}
                      onChange={setSelectedUserIds}
                      placeholder={t('certSign.collab.sessionDetail.selectUsers', 'Select users...')}
                      size="sm"
                    />
                    <SignatureSettingsInput value={signatureSettings} onChange={setSignatureSettings} />
                    <Button
                      leftSection={<AddIcon />}
                      onClick={handleAddParticipants}
                      disabled={selectedUserIds.length === 0}
                      loading={addingParticipants}
                      size="sm"
                      fullWidth
                    >
                      {t('certSign.collab.sessionDetail.addButton', 'Add Participants')}
                    </Button>
                  </Stack>
                </div>
              </>
            )}

            <Divider />

            {!session.finalized ? (
              <>
                <Alert icon={<InfoIcon />} color="blue" variant="light" p="xs">
                  <Text size="xs">
                    {session.participants.every(p => p.status === 'SIGNED')
                      ? t('certSign.allSigned', 'All participants have signed. Ready to finalize.')
                      : t('certSign.partialNote', 'You can finalize early with current signatures. Unsigned participants will be excluded.')
                    }
                  </Text>
                </Alert>
                <Button
                  leftSection={<CheckCircleIcon />}
                  size="sm"
                  color={session.participants.every(p => p.status === 'SIGNED') ? 'green' : 'orange'}
                  fullWidth
                  onClick={handleFinalize}
                  loading={finalizing}
                >
                  {session.participants.every(p => p.status === 'SIGNED')
                    ? t('certSign.collab.finalize.button', 'Finalize and load signed PDF')
                    : t('certSign.collab.finalize.early', 'Finalize with current signatures')
                  }
                </Button>
              </>
            ) : (
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
            )}
          </Stack>
        </Paper>
      </div>

      {/* Delete Confirmation Modal */}
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
    </div>
  );
};

export default SessionDetailWorkbenchView;
