import { Stack } from "@mantine/core";
import { useOneDriveSaveBlockedHint } from "@editor/hooks/useOneDriveSaveBlockedHint";

interface OneDriveOriginTooltipProps {
  label: string;
}

export function OneDriveOriginTooltip({ label }: OneDriveOriginTooltipProps) {
  const hint = useOneDriveSaveBlockedHint();
  if (!hint) return <>{label}</>;
  return (
    <Stack gap={2} data-testid="onedrive-save-blocked-hint">
      <span>{label}</span>
      <span>{hint}</span>
    </Stack>
  );
}
