import React from "react";
import { useTranslation } from "react-i18next";
import { Tooltip } from "@mantine/core";
import ComputerIcon from "@mui/icons-material/Computer";
import CloudDoneIcon from "@mui/icons-material/CloudDone";
import GroupIcon from "@mui/icons-material/Group";

import { FileOrigin } from "@app/components/filesPage/fileOrigin";

interface FileOriginBadgeProps {
  origin: FileOrigin;
  /** Compact (icon-only) vs full (icon + text). */
  compact?: boolean;
}

const styles = {
  base: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    padding: "0.1rem 0.4rem",
    borderRadius: "999px",
    fontSize: "0.68rem",
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
    lineHeight: 1.2,
  },
  local: {
    background:
      "color-mix(in srgb, var(--text-muted, #6b7280) 16%, transparent)",
    color: "var(--text-secondary)",
  },
  cloud: {
    background:
      "color-mix(in srgb, var(--accent-interactive, #6366f1) 16%, transparent)",
    color: "var(--accent-interactive, #6366f1)",
  },
  shared: {
    background:
      "color-mix(in srgb, var(--mantine-color-orange-6, #f97316) 16%, transparent)",
    color: "var(--mantine-color-orange-6, #f97316)",
  },
};

export function FileOriginBadge({
  origin,
  compact = false,
}: FileOriginBadgeProps) {
  const { t } = useTranslation();

  const config = (() => {
    switch (origin) {
      case "cloud":
        return {
          label: t("filesPage.origin.cloud", "Cloud"),
          icon: <CloudDoneIcon style={{ fontSize: "0.85rem" }} />,
          style: styles.cloud,
          tooltip: t(
            "filesPage.origin.cloudHint",
            "Stored on the Stirling server",
          ),
        };
      case "shared-with-me":
        return {
          label: t("filesPage.origin.shared", "Shared"),
          icon: <GroupIcon style={{ fontSize: "0.85rem" }} />,
          style: styles.shared,
          tooltip: t("filesPage.origin.sharedHint", "Shared with you via link"),
        };
      case "local":
      default:
        return {
          label: t("filesPage.origin.local", "Local"),
          icon: <ComputerIcon style={{ fontSize: "0.85rem" }} />,
          style: styles.local,
          tooltip: t(
            "filesPage.origin.localHint",
            "Only stored in this browser",
          ),
        };
    }
  })();

  const badge = (
    <span style={{ ...styles.base, ...config.style }}>
      {config.icon}
      {!compact && config.label}
    </span>
  );

  return (
    <Tooltip label={config.tooltip} withinPortal>
      {badge}
    </Tooltip>
  );
}
