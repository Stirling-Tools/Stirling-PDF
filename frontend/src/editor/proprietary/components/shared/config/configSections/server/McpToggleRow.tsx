import { Group, Switch, Text } from "@mantine/core";
import { InfoTooltip } from "@editor/ui/InfoTooltip";
import PendingBadge from "@editor/components/shared/config/PendingBadge";

interface McpToggleRowProps {
  label: string;
  description: string;
  checked: boolean;
  pending: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}

/** One labelled switch with its tooltip and restart-pending badge. */
export function McpToggleRow({
  label,
  description,
  checked,
  pending,
  disabled,
  onChange,
}: McpToggleRowProps) {
  return (
    <Group justify="space-between" align="flex-start" wrap="nowrap">
      <Text fw={500} size="sm">
        {label} <InfoTooltip label={description} />
      </Text>
      <Group gap="xs">
        <Switch
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
        />
        <PendingBadge show={pending} />
      </Group>
    </Group>
  );
}
