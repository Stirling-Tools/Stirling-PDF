import { useEffect, useState } from "react";
import { Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ProgressBar } from "@app/ui/ProgressBar";
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

  let value = 0.05;
  let label = t(
    "autoFormDetection.progress.starting",
    "Preparing detection...",
  );

  switch (stage.kind) {
    case "uploading":
      value = 0.35;
      label = t(
        "autoFormDetection.progress.uploading",
        "Analyzing your document...",
      );
      break;
    case "applying":
      value = 0.9;
      label = t(
        "autoFormDetection.progress.applying",
        "Building fillable fields...",
      );
      break;
    case "starting":
      value = 0.05;
      label = t(
        "autoFormDetection.progress.starting",
        "Preparing detection...",
      );
      break;
  }

  return (
    <Stack gap={6} mx="md" mt="sm">
      <ProgressBar value={value} label={label} />
      <Text size="xs" c="dimmed">
        {label}
      </Text>
    </Stack>
  );
}
