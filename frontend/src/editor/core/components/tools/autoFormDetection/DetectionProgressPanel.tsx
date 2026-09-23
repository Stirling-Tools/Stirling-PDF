import { Group, Loader, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";

/**
 * Detection is one request of unknown length, so there is no progress to report beyond
 * "in flight" - hence a spinner driven by the operation's own loading flag.
 */
export default function DetectionProgressPanel({
  active,
}: {
  active: boolean;
}) {
  const { t } = useTranslation();
  if (!active) return null;

  return (
    <Stack gap={6} mx="md" mt="sm">
      <Group gap={8} wrap="nowrap">
        <Loader size="xs" />
        <Text size="xs" c="dimmed">
          {t(
            "autoFormDetection.progress.detecting",
            "Analyzing your document...",
          )}
        </Text>
      </Group>
    </Stack>
  );
}
