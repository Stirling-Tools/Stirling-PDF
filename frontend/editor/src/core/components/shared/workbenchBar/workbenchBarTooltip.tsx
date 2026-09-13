import React from "react";
import { Group, Loader, Progress, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import { Tooltip } from "@app/components/shared/Tooltip";

/** Wrap a bar control in the bar's standard tooltip, or pass it through when
 *  the caller has no tooltip to show. */
export function renderWithTooltip(
  node: React.ReactNode,
  tooltip: React.ReactNode | undefined,
) {
  if (!tooltip) return node;
  return (
    <Tooltip
      content={tooltip}
      position="bottom"
      offset={6}
      arrow
      portalTarget={typeof document !== "undefined" ? document.body : undefined}
    >
      <div className="workbench-bar-tooltip-wrapper">{node}</div>
    </Tooltip>
  );
}

interface PolicyEnforcingTooltipProps {
  /** The blocked action's label, e.g. "Print PDF". */
  action: string;
  /** Percentage through the enforcing run, when the run reports steps. */
  progress?: number;
}

/** Tooltip body explaining that a file action is blocked by a policy run. */
export function PolicyEnforcingTooltip({
  action,
  progress,
}: PolicyEnforcingTooltipProps) {
  const { t } = useTranslation();
  return (
    <Stack gap={6} py={2} w={200}>
      <Group gap={6} wrap="nowrap">
        <ShieldOutlinedIcon style={{ fontSize: 13 }} />
        <Text size="xs" fw={600}>
          {t(
            "policy.blockingAction",
            "{{action}} blocked while enforcing policy, please wait",
            { action },
          )}
        </Text>
      </Group>
      {progress != null ? (
        <Progress
          w="100%"
          size="xs"
          radius="xl"
          value={progress}
          striped
          animated
        />
      ) : (
        <Loader size="xs" />
      )}
    </Stack>
  );
}
