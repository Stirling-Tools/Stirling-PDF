import { useState } from "react";
import { Stack, Text, Divider, Paper, Group } from "@mantine/core";
import { Button } from "@app/ui/Button";
import { Modal } from "@app/ui/Modal";
import { useTranslation } from "react-i18next";
import { Icon } from "@app/ui/Icon";
import type { SessionDetail } from "@app/types/signingSession";

interface SessionActionsPanelProps {
  session: SessionDetail;
  onAddParticipants: () => void;
  onFinalize: () => void;
  onLoadSignedPdf: () => void;
  finalizing: boolean;
  loadingPdf: boolean;
}

export const SessionActionsPanel: React.FC<SessionActionsPanelProps> = ({
  session,
  onAddParticipants,
  onFinalize,
  onLoadSignedPdf,
  finalizing,
  loadingPdf,
}) => {
  const { t } = useTranslation();

  const [confirming, setConfirming] = useState(false);
  const included = session.participants.filter((p) => p.status === "SIGNED");
  const excluded = session.participants.filter((p) => p.status !== "SIGNED");
  const allSigned = included.length > 0 && excluded.length === 0;

  return (
    <Stack gap="md">
      {/* Session Info - only shown when there is something to display */}
      {(session.dueDate || session.message) && (
        <Stack gap="xs">
          <Text size="sm" fw={600}>
            {t("certSign.collab.sessionDetail.sessionInfo", "Session Info")}
          </Text>
          {session.dueDate && (
            <Paper p="xs" withBorder>
              <Text size="xs" fw={600} c="dimmed">
                {t("certSign.collab.sessionDetail.dueDate", "Due Date")}
              </Text>
              <Text size="xs">{session.dueDate}</Text>
            </Paper>
          )}
          {session.message && (
            <Paper p="xs" withBorder>
              <Text size="xs" fw={600} c="dimmed">
                {t("certSign.collab.sessionDetail.messageLabel", "Message")}
              </Text>
              <Text size="xs">{session.message}</Text>
            </Paper>
          )}
        </Stack>
      )}

      {/* Primary Actions */}
      {!session.finalized && (
        <>
          <Divider />
          <Button
            variant="secondary"
            leftSection={<Icon name="plus" />}
            onClick={onAddParticipants}
            fullWidth
          >
            {t(
              "certSign.collab.sessionDetail.addParticipants",
              "Add Participants",
            )}
          </Button>

          <Divider />

          <Button
            leftSection={<Icon name="circle-check" />}
            accent={allSigned ? "success" : "warning"}
            fullWidth
            onClick={() => setConfirming(true)}
            disabled={included.length === 0}
            loading={finalizing}
          >
            {allSigned
              ? t(
                  "certSign.collab.finalize.button",
                  "Finalize and Load Signed PDF",
                )
              : t(
                  "certSign.collab.finalize.early",
                  "Finalize with Current Signatures",
                )}
          </Button>
          {included.length === 0 && (
            <Text size="sm">
              {t(
                "certSign.collab.finalize.requiresSignature",
                "At least one participant must sign before you can finalize.",
              )}
            </Text>
          )}
          <Modal
            open={confirming}
            onClose={() => setConfirming(false)}
            title={t(
              "certSign.collab.finalize.confirmTitle",
              "Finalize this signing session?",
            )}
            footer={
              <Group justify="flex-end">
                <Button
                  variant="secondary"
                  onClick={() => setConfirming(false)}
                >
                  {t("cancel", "Cancel")}
                </Button>
                <Button
                  disabled={included.length === 0}
                  onClick={() => {
                    setConfirming(false);
                    onFinalize();
                  }}
                >
                  {t(
                    "certSign.collab.finalize.confirmAction",
                    "Confirm and finalize",
                  )}
                </Button>
              </Group>
            }
          >
            <Stack gap="sm">
              <Text>
                {t(
                  "certSign.collab.finalize.confirmDescription",
                  "Finalizing closes this session. No more signatures can be submitted.",
                )}
              </Text>
              <Text fw={600}>
                {t("certSign.collab.finalize.included", "Signatures included")}
              </Text>
              {included.map((p) => (
                <Text key={p.id}>{p.name || p.email}</Text>
              ))}
              {excluded.length > 0 && (
                <>
                  <Text fw={600}>
                    {t(
                      "certSign.collab.finalize.excluded",
                      "Participants whose signatures will not be included",
                    )}
                  </Text>
                  {excluded.map((p) => (
                    <Text key={p.id}>
                      {p.name || p.email} —{" "}
                      {p.status === "DECLINED"
                        ? t("certSign.declined", "Declined")
                        : t("certSign.pending", "Pending")}
                    </Text>
                  ))}
                </>
              )}
            </Stack>
          </Modal>
        </>
      )}

      {session.finalized && (
        <>
          <Button
            leftSection={<Icon name="circle-check" />}
            fullWidth
            onClick={onLoadSignedPdf}
            loading={loadingPdf}
          >
            {t(
              "certSign.collab.sessionDetail.loadSignedPdf",
              "Load Signed PDF into Active Files",
            )}
          </Button>
        </>
      )}
    </Stack>
  );
};
