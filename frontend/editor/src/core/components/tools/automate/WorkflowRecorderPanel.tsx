import { Button, Card, Group, Stack, Text } from "@mantine/core";
import RadioButtonCheckedIcon from "@mui/icons-material/RadioButtonChecked";
import StopCircleIcon from "@mui/icons-material/StopCircle";
import DeleteIcon from "@mui/icons-material/Delete";
import SettingsIcon from "@mui/icons-material/Settings";
import { useTranslation } from "react-i18next";
import { useWorkflowRecorder } from "@app/contexts/workflowRecorder/WorkflowRecorderContext";
import type { AutomationConfig } from "@app/types/automation";

interface WorkflowRecorderPanelProps {
  onReview: (automation: AutomationConfig) => void;
}

export default function WorkflowRecorderPanel({
  onReview,
}: WorkflowRecorderPanelProps) {
  const { t } = useTranslation();
  const recorder = useWorkflowRecorder();

  const handleReview = () => {
    const automation = recorder.buildAutomationConfig();
    if (automation) {
      onReview(automation);
    }
  };

  if (!recorder.isRecording && !recorder.draft) {
    return (
      <Card padding="sm" withBorder>
        <Group justify="space-between" align="center" gap="sm">
          <div>
            <Text size="sm" fw={600}>
              {t("automate.recorder.startTitle", "Record a workflow")}
            </Text>
            <Text size="xs" c="dimmed">
              {t(
                "automate.recorder.startDescription",
                "Run tools normally, then save the captured steps as an automation.",
              )}
            </Text>
          </div>
          <Button
            size="xs"
            leftSection={<RadioButtonCheckedIcon fontSize="small" />}
            onClick={recorder.startRecording}
          >
            {t("automate.recorder.start", "Start Recording")}
          </Button>
        </Group>
      </Card>
    );
  }

  const recordedCount = recorder.recordableSteps.length;
  const skippedCount = recorder.skippedSteps.length;

  return (
    <Card padding="sm" withBorder>
      <Stack gap="xs">
        <Group justify="space-between" align="center" gap="sm">
          <div>
            <Text size="sm" fw={600}>
              {recorder.isRecording
                ? t("automate.recorder.recordingTitle", "Recording workflow")
                : t("automate.recorder.reviewTitle", "Recorded workflow")}
            </Text>
            <Text size="xs" c="dimmed">
              {t(
                "automate.recorder.stepSummary",
                "{{recorded}} saved step(s), {{skipped}} skipped step(s)",
                {
                  recorded: recordedCount,
                  skipped: skippedCount,
                },
              )}
            </Text>
          </div>
          <Group gap="xs">
            {recorder.isRecording ? (
              <Button
                size="xs"
                variant="light"
                leftSection={<StopCircleIcon fontSize="small" />}
                onClick={recorder.stopRecording}
              >
                {t("automate.recorder.stop", "Stop")}
              </Button>
            ) : (
              <Button
                size="xs"
                leftSection={<SettingsIcon fontSize="small" />}
                onClick={handleReview}
                disabled={recordedCount === 0}
              >
                {t("automate.recorder.review", "Review")}
              </Button>
            )}
            <Button
              size="xs"
              variant="subtle"
              color="red"
              leftSection={<DeleteIcon fontSize="small" />}
              onClick={recorder.discardRecording}
            >
              {t("automate.recorder.discard", "Discard")}
            </Button>
          </Group>
        </Group>

        {skippedCount > 0 && (
          <Text size="xs" c="dimmed">
            {t(
              "automate.recorder.skippedHint",
              "Skipped steps are shown for awareness but are not saved into the automation.",
            )}
          </Text>
        )}
      </Stack>
    </Card>
  );
}
