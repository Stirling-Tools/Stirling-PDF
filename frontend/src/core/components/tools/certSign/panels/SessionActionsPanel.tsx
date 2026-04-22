import { Stack, Text, Button, Divider, Paper } from "@mantine/core";
import { useTranslation } from "react-i18next";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import AddIcon from "@mui/icons-material/Add";
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

  const allSigned = session.participants.every((p) => p.status === "SIGNED");

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
            leftSection={<AddIcon />}
            onClick={onAddParticipants}
            variant="light"
            fullWidth
          >
            {t(
              "certSign.collab.sessionDetail.addParticipants",
              "Add Participants",
            )}
          </Button>

          <Divider />

          <Button
            leftSection={<CheckCircleIcon />}
            color={allSigned ? "green" : "orange"}
            fullWidth
            onClick={onFinalize}
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
        </>
      )}

      {session.finalized && (
        <>
          <Button
            leftSection={<CheckCircleIcon />}
            color="blue"
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
