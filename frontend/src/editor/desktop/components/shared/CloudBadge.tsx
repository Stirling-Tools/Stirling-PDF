import { Badge, Tooltip } from "@mantine/core";
import { Icon } from "@app/ui/Icon";
import { useTranslation } from "react-i18next";

interface CloudBadgeProps {
  className?: string;
}

/**
 * Badge component to indicate that a tool uses cloud/SaaS backend processing
 * Displayed on tool cards when the tool will be routed to the SaaS backend
 * instead of the local bundled backend.
 */
export function CloudBadge({ className }: CloudBadgeProps) {
  const { t } = useTranslation();

  return (
    <Tooltip
      label={t(
        "cloudBadge.tooltip",
        "Runs in the cloud (included, no extra charge)",
      )}
      position="top"
      withArrow
    >
      <Badge
        className={className}
        leftSection={<Icon name="cloud" size={12} />}
        variant="light"
        color="blue"
        size="xs"
      ></Badge>
    </Tooltip>
  );
}
