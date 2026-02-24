import { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Stack, Paper, Text, Group, Badge, Button, Divider, Modal } from '@mantine/core';
import { alert } from '@app/components/toast';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteIcon from '@mui/icons-material/Delete';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import ZoomOutMapIcon from '@mui/icons-material/ZoomOutMap';
import { Z_INDEX_FULLSCREEN_SURFACE } from '@app/styles/zIndex';
import { SessionDetail } from '@app/types/signingSession';
import { SignatureSettings } from '@app/components/tools/certSign/SignatureSettingsInput';
import { LocalEmbedPDFWithAnnotations, SignaturePreview, AnnotationAPI } from '@app/components/viewer/LocalEmbedPDFWithAnnotations';
import { ParticipantListPanel } from '@app/components/tools/certSign/panels/ParticipantListPanel';
import { SessionActionsPanel } from '@app/components/tools/certSign/panels/SessionActionsPanel';
import { AddParticipantsFlow } from '@app/components/tools/certSign/modals/AddParticipantsFlow';

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
  const {
    session,
    pdfFile,
    onFinalize,
    onLoadSignedPdf,
    onAddParticipants,
    onRemoveParticipant,
    onDelete,
    onBack,
    onRefresh,
  } = data;

  // Ref for annotation API (to access zoom controls)
  const annotationApiRef = useRef<AnnotationAPI | null>(null);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [addParticipantsModalOpen, setAddParticipantsModalOpen] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(false);

  // Auto-refresh every 30 seconds when not finalized
  useEffect(() => {
    if (!session.finalized) {
      const interval = setInterval(() => {
        onRefresh();
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [session.finalized, onRefresh]);

  const handleAddParticipants = async (userIds: number[], settings: SignatureSettings) => {
    try {
      await onAddParticipants(userIds, settings);
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
      throw _error; // Re-throw so modal can handle loading state
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

  // Extract wet signatures from all participants for preview
  const wetSignaturePreviews = useMemo<SignaturePreview[]>(() => {
    const previews: SignaturePreview[] = [];

    session.participants.forEach((participant, participantIndex) => {
      if (participant.wetSignatures && participant.wetSignatures.length > 0) {
        participant.wetSignatures.forEach((wetSig, sigIndex) => {
          previews.push({
            id: `participant-${participant.userId}-sig-${sigIndex}`,
            pageIndex: wetSig.page,
            x: wetSig.x,
            y: wetSig.y,
            width: wetSig.width,
            height: wetSig.height,
            signatureData: wetSig.data,
          });
        });
      }
    });

    return previews;
  }, [session.participants]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Top Control Bar */}
      <Paper p="sm" shadow="sm" style={{ flexShrink: 0, zIndex: Z_INDEX_FULLSCREEN_SURFACE }}>
        <Group justify="space-between">
          <Group gap="md">
            <Button leftSection={<ArrowBackIcon />} variant="subtle" onClick={onBack} size="sm">
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

          <Group gap="xs">
            {/* Zoom Controls */}
            <Button.Group>
              <Button
                variant="default"
                size="sm"
                onClick={() => annotationApiRef.current?.zoomOut()}
                title={t('viewer.zoomOut', 'Zoom out')}
              >
                <ZoomOutIcon fontSize="small" />
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => annotationApiRef.current?.resetZoom()}
                title={t('viewer.resetZoom', 'Reset zoom')}
              >
                <ZoomOutMapIcon fontSize="small" />
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => annotationApiRef.current?.zoomIn()}
                title={t('viewer.zoomIn', 'Zoom in')}
              >
                <ZoomInIcon fontSize="small" />
              </Button>
            </Button.Group>

            {/* Delete Session Button */}
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
            borderRight: '1px solid var(--mantine-color-gray-3)',
          }}
        >
          <ParticipantListPanel
            participants={session.participants}
            finalized={session.finalized}
            onRemove={handleRemoveParticipant}
          />
        </Paper>

        {/* Center - PDF Viewer */}
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          <LocalEmbedPDFWithAnnotations
            ref={annotationApiRef}
            file={pdfFile}
            initialSignatures={wetSignaturePreviews}
            readOnly={true}
          />
        </div>

        {/* Right Panel - Session Actions */}
        <Paper
          p="md"
          shadow="sm"
          style={{
            width: '320px',
            flexShrink: 0,
            overflowY: 'auto',
            borderLeft: '1px solid var(--mantine-color-gray-3)',
          }}
        >
          <SessionActionsPanel
            session={session}
            onAddParticipants={() => setAddParticipantsModalOpen(true)}
            onFinalize={handleFinalize}
            onLoadSignedPdf={handleLoadSignedPdf}
            finalizing={finalizing}
            loadingPdf={loadingPdf}
          />
        </Paper>
      </div>

      {/* Add Participants Modal */}
      <AddParticipantsFlow
        opened={addParticipantsModalOpen}
        onClose={() => setAddParticipantsModalOpen(false)}
        onSubmit={handleAddParticipants}
      />

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
