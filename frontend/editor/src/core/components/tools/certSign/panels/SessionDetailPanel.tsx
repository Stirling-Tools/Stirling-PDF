import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Stack, Text, Group, Modal } from "@mantine/core";
import { Button } from "@app/ui/Button";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Tooltip } from "@app/ui/Tooltip";
import { StatusBadge } from "@app/ui/StatusBadge";
import { ProgressBar } from "@app/ui/ProgressBar";
import { SigningSessionHeader } from "@app/components/shared/signing/SigningSessionHeader";
import { alert } from "@app/components/toast";
import { Icon } from "@app/ui/Icon";
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
    onRefresh,
  } = data;

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [addParticipantsModalOpen, setAddParticipantsModalOpen] =
    useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const signedCount = session.participants.filter(
    (p) => p.status === "SIGNED",
  ).length;
  const busy = finalizing || deleting || loadingPdf;

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
    <div className="signing-detail">
      <div className="signing-detail__body">
        <SigningSessionHeader
          documentName={session.documentName}
          owner={session.ownerEmail}
          createdAt={session.createdAt}
          dueDate={session.dueDate}
          message={session.message}
          status={
            <StatusBadge tone={session.finalized ? "success" : "info"}>
              {session.finalized
                ? t("certSign.collab.sessionList.finalized", "Finalized")
                : t("certSign.collab.sessionList.active", "Active")}
            </StatusBadge>
          }
          actions={
            !session.finalized && (
              <Tooltip
                content={t(
                  "certSign.collab.sessionDetail.deleteSession",
                  "Delete Session",
                )}
              >
                <ActionIcon
                  variant="tertiary"
                  accent="neutral"
                  aria-label={t(
                    "certSign.collab.sessionDetail.deleteSession",
                    "Delete Session",
                  )}
                  disabled={busy}
                  onClick={() => setDeleteModalOpen(true)}
                >
                  <Icon name="trash" size={18} />
                </ActionIcon>
              </Tooltip>
            )
          }
        />
        <div className="signing-detail__summary">
          <div className="signing-detail__heading">
            <h3>{t("signingDetail.progress", "Signature progress")}</h3>
            <StatusBadge
              tone={
                signedCount === session.participants.length && signedCount > 0
                  ? "success"
                  : "neutral"
              }
              showDot={false}
            >
              {t("signingDetail.signedCount", "{{signed}} / {{total}} signed", {
                signed: signedCount,
                total: session.participants.length,
              })}
            </StatusBadge>
          </div>
          <ProgressBar
            value={
              session.participants.length
                ? signedCount / session.participants.length
                : 0
            }
            label={t("signingDetail.progress", "Signature progress")}
          />
        </div>
        <section className="signing-detail__section">
          <div className="signing-detail__heading">
            <h3>
              {t("certSign.collab.sessionDetail.participants", "Participants")}
            </h3>
            {!session.finalized && (
              <Button
                size="sm"
                variant="tertiary"
                leftSection={<Icon name="plus" size={16} />}
                disabled={busy}
                onClick={() => setAddParticipantsModalOpen(true)}
              >
                {t(
                  "certSign.collab.sessionDetail.addParticipants",
                  "Add Participants",
                )}
              </Button>
            )}
          </div>
          <ParticipantListPanel
            participants={session.participants}
            finalized={session.finalized}
            onRemove={handleRemoveParticipant}
            disabled={busy}
          />
        </section>
      </div>
      <footer className="signing-detail__footer">
        {data.onOpenMyRequest && !session.finalized && (
          <Button onClick={data.onOpenMyRequest} disabled={busy} fullWidth>
            {t("signingDetail.signMyRequest", "Sign this document")}
          </Button>
        )}
        <SessionActionsPanel
          session={session}
          onFinalize={handleFinalize}
          onLoadSignedPdf={handleLoadSignedPdf}
          finalizing={finalizing}
          loadingPdf={loadingPdf}
          disabled={busy}
        />
      </footer>
      <AddParticipantsFlow
        opened={addParticipantsModalOpen}
        onClose={() => setAddParticipantsModalOpen(false)}
        onSubmit={handleAddParticipants}
      />

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
            <Button
              variant="tertiary"
              onClick={() => setDeleteModalOpen(false)}
            >
              {t("cancel", "Cancel")}
            </Button>
            <Button accent="danger" onClick={handleDelete} loading={deleting}>
              {t("delete", "Delete")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </div>
  );
};

export default SessionDetailPanel;
