import { Group, Paper, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui/Button";
import { useFeedback } from "@editor/hooks/useFeedback";

/** The Settings entry for feedback; renders nothing when feedback is unavailable. */
export default function FeedbackSection() {
  const { t } = useTranslation();
  const openFeedback = useFeedback();

  if (!openFeedback) {
    return null;
  }

  return (
    <Paper withBorder p="md" radius="md">
      <Group justify="space-between" align="center">
        <Text size="sm">
          {t(
            "settings.feedback.send.description",
            "Report a problem or suggest an improvement to the Stirling team.",
          )}
        </Text>
        <Button variant="secondary" size="sm" onClick={openFeedback}>
          {t("settings.feedback.send.label", "Send feedback")}
        </Button>
      </Group>
    </Paper>
  );
}
