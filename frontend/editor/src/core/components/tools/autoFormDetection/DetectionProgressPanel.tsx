import { useEffect, useState } from "react";
import { Group, Loader, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { DetectionStage, onStage } from "@app/services/formDetection/progress";

export default function DetectionProgressPanel({
  active,
}: {
  active: boolean;
}) {
  const { t } = useTranslation();
  const [stage, setStage] = useState<DetectionStage | null>(null);

  useEffect(() => onStage(setStage), []);
  useEffect(() => {
    if (!active) setStage(null);
  }, [active]);

  if (!active || !stage || stage.kind === "done") return null;

  // Detection is one request of unknown length, so a spinner is honest where a percentage
  // would have to be invented.
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
