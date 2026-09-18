import { Badge } from "@mantine/core";
import { useTranslation } from "react-i18next";
import type { ToolRegistryEntry } from "@app/data/toolsTaxonomy";
import { useToolFreshnessBadge } from "@app/hooks/tools/useToolFreshnessBadge";

interface ToolStatusBadgesProps {
  toolId: string;
  tool: ToolRegistryEntry;
  // Matches the 0.25 opacity tool rows use when visually unavailable.
  dimmed?: boolean;
}

/** Status chips shown next to a tool's name: Alpha/Beta plus New/Updated. */
const ToolStatusBadges = ({
  toolId,
  tool,
  dimmed = false,
}: ToolStatusBadgesProps) => {
  const { t } = useTranslation();
  const freshness = useToolFreshnessBadge(toolId, tool);

  const badges: { key: string; color: string; label: string }[] = [];
  if (tool.versionStatus === "alpha") {
    badges.push({
      key: "alpha",
      color: "orange",
      label: t("toolPanel.alpha", "Alpha"),
    });
  } else if (tool.versionStatus === "beta") {
    badges.push({
      key: "beta",
      color: "orange",
      label: t("toolPanel.beta", "Beta"),
    });
  }
  if (freshness === "new") {
    badges.push({
      key: "new",
      color: "teal",
      label: t("toolPanel.new", "New"),
    });
  } else if (freshness === "updated") {
    badges.push({
      key: "updated",
      color: "blue",
      label: t("toolPanel.updated", "Updated"),
    });
  }
  if (badges.length === 0) return null;

  return (
    <>
      {badges.map(({ key, color, label }) => (
        <Badge
          key={key}
          size="xs"
          variant="light"
          color={color}
          style={{ flexShrink: 0, opacity: dimmed ? 0.25 : 1 }}
        >
          {label}
        </Badge>
      ))}
    </>
  );
};

export default ToolStatusBadges;
