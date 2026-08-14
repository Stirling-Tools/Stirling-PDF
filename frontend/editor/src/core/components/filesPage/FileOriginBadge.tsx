import React from "react";
import { useTranslation } from "react-i18next";
import { Tooltip } from "@mantine/core";
import ComputerIcon from "@mui/icons-material/Computer";
import StorageIcon from "@mui/icons-material/Storage";
import CloudDoneIcon from "@mui/icons-material/CloudDone";
import GroupIcon from "@mui/icons-material/Group";

import { FileOrigin } from "@app/components/filesPage/fileOrigin";

interface FileOriginBadgeProps {
  /** "disk" is a display-only origin for files listed from a mounted directory. */
  origin: FileOrigin | "disk";
  /** Compact (icon-only) vs full (icon + text). */
  compact?: boolean;
  /**
   * Override the hover text. The defaults are phrased for files; a folder
   * wearing the same badge needs its own wording.
   */
  tooltip?: string;
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
    background: "color-mix(in srgb, var(--c-text-subtle) 16%, transparent)",
    color: "var(--c-text-muted)",
  },
  cloud: {
    background: "color-mix(in srgb, var(--c-primary) 16%, transparent)",
    color: "var(--c-accent-text)",
  },
  shared: {
    background:
      "color-mix(in srgb, var(--mantine-color-orange-6) 16%, transparent)",
    color: "var(--color-amber-dark)",
  },
};

export function FileOriginBadge({
  origin,
  compact = false,
  tooltip,
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
      case "disk":
        return {
          label: t("filesPage.origin.disk", "On disk"),
          // Deliberately NOT the Computer icon: "local" (this browser) wears
          // that one, and in compact mode the icon is the whole badge — two
          // origins sharing a glyph read as the same place.
          icon: <StorageIcon style={{ fontSize: "0.85rem" }} />,
          style: styles.local,
          tooltip: t(
            "filesPage.origin.diskHint",
            "A file in the mounted folder on your disk",
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
    <Tooltip label={tooltip ?? config.tooltip} withinPortal>
      {badge}
    </Tooltip>
  );
}
