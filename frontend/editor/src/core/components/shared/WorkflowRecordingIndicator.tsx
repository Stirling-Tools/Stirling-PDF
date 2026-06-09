import { ActionIcon, Group, Text } from "@mantine/core";
import StopCircleIcon from "@mui/icons-material/StopCircle";
import DeleteIcon from "@mui/icons-material/Delete";
import RadioButtonCheckedIcon from "@mui/icons-material/RadioButtonChecked";
import { useTranslation } from "react-i18next";
import { Tooltip } from "@app/components/shared/Tooltip";
import { useWorkflowRecorder } from "@app/contexts/workflowRecorder/WorkflowRecorderContext";

export default function WorkflowRecordingIndicator() {
  const { t } = useTranslation();
  const recorder = useWorkflowRecorder();

  if (!recorder.isRecording) {
    return null;
  }

  return (
    <Group gap={4} wrap="nowrap" align="center">
      <RadioButtonCheckedIcon
        style={{ fontSize: "0.9rem", color: "var(--mantine-color-red-6)" }}
      />
      <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
        {t("automate.recorder.indicator", "{{count}} step(s)", {
          count: recorder.recordableSteps.length,
        })}
      </Text>
      <Tooltip content={t("automate.recorder.stop", "Stop")} position="bottom">
        <ActionIcon
          variant="subtle"
          radius="md"
          size="sm"
          onClick={recorder.stopRecording}
          aria-label={t("automate.recorder.stop", "Stop")}
        >
          <StopCircleIcon sx={{ fontSize: "1rem" }} />
        </ActionIcon>
      </Tooltip>
      <Tooltip
        content={t("automate.recorder.discard", "Discard")}
        position="bottom"
      >
        <ActionIcon
          variant="subtle"
          color="red"
          radius="md"
          size="sm"
          onClick={recorder.discardRecording}
          aria-label={t("automate.recorder.discard", "Discard")}
        >
          <DeleteIcon sx={{ fontSize: "1rem" }} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}
