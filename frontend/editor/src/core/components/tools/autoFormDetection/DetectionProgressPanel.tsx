import { useEffect, useState } from "react";
import { Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ProgressBar } from "@app/ui/ProgressBar";
import { DetectionStage, onStage } from "@app/services/formDetection/progress";

function mb(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / (1024 * 1024)))} MB`;
}

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
  let note: string | null = null;

  switch (stage.kind) {
    case "model-download": {
      const frac = stage.totalBytes
        ? stage.loadedBytes / stage.totalBytes
        : 0.5;
      value = 0.05 + 0.3 * Math.min(1, frac);
      label = stage.totalBytes
        ? t(
            "autoFormDetection.progress.downloadingSized",
            "Fetching AI model ({{loaded}} of {{total}})...",
            { loaded: mb(stage.loadedBytes), total: mb(stage.totalBytes) },
          )
        : t("autoFormDetection.progress.downloading", "Fetching AI model...");
      note = t(
        "autoFormDetection.progress.downloadNote",
        "One-time setup - future runs start instantly.",
      );
      break;
    }
    case "model-init":
      value = 0.38;
      label = t(
        "autoFormDetection.progress.loadingModel",
        "Getting the model ready...",
      );
      break;
    case "rendering":
      value = 0.4 + 0.15 * (stage.page / Math.max(1, stage.pageCount));
      label = t(
        "autoFormDetection.progress.rendering",
        "Preparing page {{page}} of {{pageCount}}...",
        { page: stage.page, pageCount: stage.pageCount },
      );
      break;
    case "analyzing":
      value = 0.55 + 0.38 * (stage.page / Math.max(1, stage.pageCount));
      label = t(
        "autoFormDetection.progress.analyzing",
        "Analyzing page {{page}} of {{pageCount}}...",
        { page: stage.page, pageCount: stage.pageCount },
      );
      break;
    case "uploading":
      value = 0.35;
      label = t(
        "autoFormDetection.progress.uploading",
        "Analyzing your document...",
      );
      break;
    case "applying":
      value = 0.96;
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
      {note ? (
        <Text size="xs" c="dimmed">
          {note}
        </Text>
      ) : null}
    </Stack>
  );
}
