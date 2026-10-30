import { Group, Paper, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui/Button";
import { Icon } from "@editor/ui/Icon";
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
        <div>
          <Text fw={600} size="sm">
            {t("settings.feedback.send.title", "Send feedback")}
          </Text>
          <Text size="xs" c="dimmed" mt={4}>
            {t(
              "settings.feedback.send.description",
              "Report a problem or suggest an improvement to the Stirling team.",
            )}
          </Text>
        </div>
        <Button
          variant="secondary"
          size="sm"
          leftSection={<Icon name="message-square" size="1rem" />}
          onClick={openFeedback}
        >
          {t("settings.feedback.send.open", "Open")}
        </Button>
      </Group>
    </Paper>
  );
}
