import { Stack, Text } from "@mantine/core";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import type { ToolTiming } from "@app/services/toolTiming";

interface Props {
  timing: ToolTiming;
}

export default function ToolTimingPanel({ timing }: Props) {
  const { t } = useTranslation();

  return (
    <Stack gap="xs" data-testid="tool-timing">
      <Text size="sm">{summaryOf(timing, t)}</Text>
      <ServerProcessingTime ms={timing.serverProcessingMs} />
      <Text size="xs" c="dimmed">
        {t(
          "toolTiming.firstRun",
          "The first run includes one-off setup, so run it again for a steady-state time.",
        )}
      </Text>
    </Stack>
  );
}

function summaryOf(timing: ToolTiming, t: TFunction): string {
  const values = { ms: Math.round(timing.totalMs), files: timing.files };
  if (timing.location === "server") {
    return t(
      "toolTiming.rustServer",
      "Rust on the server: {{ms}} ms round trip for {{files}} file(s)",
      values,
    );
  }
  return timing.implementation === "rust"
    ? t(
        "toolTiming.rustBrowser",
        "Rust in your browser: {{ms}} ms for {{files}} file(s)",
        values,
      )
    : t(
        "toolTiming.typescriptBrowser",
        "TypeScript in your browser: {{ms}} ms for {{files}} file(s)",
        values,
      );
}

function ServerProcessingTime({ ms }: { ms: number | null }) {
  const { t } = useTranslation();
  if (ms === null) return null;
  return (
    <Text size="sm">
      {t(
        "toolTiming.serverProcessing",
        "{{ms}} ms of that was processing on the server",
        { ms: Math.round(ms) },
      )}
    </Text>
  );
}
