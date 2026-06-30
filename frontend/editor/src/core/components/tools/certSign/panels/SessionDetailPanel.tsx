import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Stack,
  Text,
  Group,
  Badge,
  Button,
  Divider,
  Modal,
} from "@mantine/core";
import { alert } from "@app/components/toast";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DeleteIcon from "@mui/icons-material/Delete";
import { ParticipantListPanel } from "@app/components/tools/certSign/panels/ParticipantListPanel";
import { SessionActionsPanel } from "@app/components/tools/certSign/panels/SessionActionsPanel";
import { AddParticipantsFlow } from "@app/components/tools/certSign/modals/AddParticipantsFlow";
import type { SigningDetailData } from "@app/hooks/signing/useSigningSessionController";

interface SessionDetailPanelProps {
  data: SigningDetailData;
}

/** Sidebar controls for an owned signing session (status, participants, actions); the document + read-only overlays render in the main Viewer. */
export const SessionDetailPanel = ({ data }: SessionDetailPanelProps) => {
  const { t } = useTranslation();
  const {
    session,
    onFinalize,
    onLoadSignedPdf,
    onAddParticipants,
    onRemoveParticipant,
    onDelete,
    onBack,
    onRefresh,
  } = data;

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [addParticipantsModalOpen, setAddParticipantsModalOpen] =
    useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(false);

  // Auto-refresh every 30 seconds while the session is active.
  useEffect(() => {
    if (session.finalized) return;
    const interval = setInterval(() => {
      onRefresh();
    }, 30000);
    return () => clearInterval(interval);
  }, [session.finalized, onRefresh]);

  const handleAddParticipants = async (
    userIds: number[],
    defaultReason?: string,
  ) => {
    try {
      await onAddParticipants(userIds, defaultReason);
      alert({
        alertType: "success",
        title: t("success"),
        body: t(
          "certSign.collab.sessionDetail.participantsAdded",
          "Participants added successfully",
        ),
      });
    } catch (error) {
      alert({
        alertType: "error",
        title: t("common.error"),
        body: t(
          "certSign.collab.sessionDetail.addParticipantsError",
          "Failed to add participants",
        ),
      });
      throw error; // Re-throw so the modal can handle its loading state
    }
  };

  const handleRemoveParticipant = async (participantId: number) => {
    try {
      await onRemoveParticipant(participantId);
      alert({
        alertType: "success",
        title: t("success"),
        body: t(
          "certSign.collab.sessionDetail.participantRemoved",
          "Participant removed",
        ),
      });
    } catch (_error) {
      alert({
        alertType: "error",
        title: t("common.error"),
        body: t(
          "certSign.collab.sessionDetail.removeParticipantError",
          "Failed to remove participant",
        ),
      });
    }
  };

  const handleFinalize = async () => {
    setFinalizing(true);
    try {
      await onFinalize();
    } catch (_error) {
      alert({
        alertType: "error",
        title: t("common.error"),
        body: t(
          "certSign.collab.sessionDetail.finalizeError",
          "Failed to finalize session",
        ),
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
    } catch (_error) {
      alert({
        alertType: "error",
        title: t("common.error"),
        body: t(
          "certSign.collab.sessionDetail.deleteError",
          "Failed to delete session",
        ),
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
        alertType: "error",
        title: t("common.error"),
        body: t(
          "certSign.collab.sessionDetail.loadPdfError",
          "Failed to load signed PDF",
        ),
      });
    } finally {
      setLoadingPdf(false);
    }
  };

  return (
    <Stack gap="md" p="md" h="100%" style={{ minHeight: 0 }}>
      <Button
        leftSection={<ArrowBackIcon fontSize="small" />}
        variant="subtle"
        size="sm"
        onClick={onBack}
        justify="flex-start"
        px={6}
        style={{ alignSelf: "flex-start" }}
      >
        {t("certSign.collab.sessionDetail.backToList", "Back to Sessions")}
      </Button>

      <Stack gap={4}>
        <Group gap="sm" wrap="nowrap">
          <Text size="sm" fw={600} truncate style={{ flex: 1, minWidth: 0 }}>
            {session.documentName}
          </Text>
          <Badge
            size="sm"
            color={session.finalized ? "green" : "blue"}
            variant="light"
          >
            {session.finalized
              ? t("certSign.collab.sessionList.finalized", "Finalized")
              : t("certSign.collab.sessionList.active", "Active")}
          </Badge>
        </Group>
        {(session.ownerEmail || session.createdAt) && (
          <Text size="xs" c="dimmed">
            {session.ownerEmail &&
              `${t("certSign.collab.sessionDetail.owner", "Owner")}: ${session.ownerEmail}`}
            {session.ownerEmail && session.createdAt && " • "}
            {session.createdAt &&
              new Date(session.createdAt).toLocaleDateString()}
          </Text>
        )}
      </Stack>

      <Divider />

      {/* Participants — scrollable, bounded so actions stay visible */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        <ParticipantListPanel
          participants={session.participants}
          finalized={session.finalized}
          onRemove={handleRemoveParticipant}
        />
      </div>

      <Divider />

      <SessionActionsPanel
        session={session}
        onAddParticipants={() => setAddParticipantsModalOpen(true)}
        onFinalize={handleFinalize}
        onLoadSignedPdf={handleLoadSignedPdf}
        finalizing={finalizing}
        loadingPdf={loadingPdf}
      />

      {!session.finalized && (
        <Button
          leftSection={<DeleteIcon fontSize="small" />}
          color="red"
          variant="light"
          fullWidth
          onClick={() => setDeleteModalOpen(true)}
        >
          {t("certSign.collab.sessionDetail.deleteSession", "Delete Session")}
        </Button>
      )}

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
        title={t(
          "certSign.collab.sessionDetail.deleteSession",
          "Delete Session",
        )}
      >
        <Stack gap="md">
          <Text>
            {t(
              "certSign.collab.sessionDetail.deleteConfirm",
              "Are you sure? This cannot be undone.",
            )}
          </Text>
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setDeleteModalOpen(false)}>
              {t("cancel", "Cancel")}
            </Button>
            <Button color="red" onClick={handleDelete} loading={deleting}>
              {t("delete", "Delete")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
};

export default SessionDetailPanel;
