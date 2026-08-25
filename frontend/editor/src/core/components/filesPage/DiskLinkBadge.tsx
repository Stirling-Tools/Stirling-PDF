import { useTranslation } from "react-i18next";
import { Tooltip } from "@mantine/core";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import SyncProblemIcon from "@mui/icons-material/SyncProblem";

import { StirlingFileStub } from "@app/types/fileContext";
import { diskLinkState } from "@app/services/diskFileSync";

/** Keeps a lost or diverged disk link on screen, where only a transient toast said so.
 *  Silent when healthy or never from disk, so it always means trouble. */
interface DiskLinkBadgeProps {
  file: StirlingFileStub;
  /** Icon-only, for dense rows. */
  compact?: boolean;
}

const badgeStyle = {
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
  background:
    "color-mix(in srgb, var(--mantine-color-yellow-6) 18%, transparent)",
  color: "var(--color-amber-dark)",
};

export function DiskLinkBadge({ file, compact = false }: DiskLinkBadgeProps) {
  const { t } = useTranslation();
  const state = diskLinkState(file);

  if (state === "none" || state === "linked") return null;

  const config =
    state === "orphaned"
      ? {
          label: t("filesPage.diskLink.orphaned", "Not on disk"),
          icon: <LinkOffIcon style={{ fontSize: "0.85rem" }} />,
          tooltip: t(
            "filesPage.diskLink.orphanedHint",
            "The original at {{path}} is gone. This copy is only here - saving it will ask for a new location.",
            { path: file.orphanedFilePath ?? "" },
          ),
        }
      : {
          label: t("filesPage.diskLink.conflict", "Disk changed"),
          icon: <SyncProblemIcon style={{ fontSize: "0.85rem" }} />,
          tooltip: t(
            "filesPage.diskLink.conflictHint",
            "The file on disk changed while you had unsaved edits. Your version is shown - saving will overwrite the one on disk.",
          ),
        };

  return (
    <Tooltip label={config.tooltip} withinPortal multiline maw={300}>
      {/* Icon-only needs its own name, but aria-label is prohibited on a bare
          span, hence role="img". With the label visible it would shadow the text. */}
      <span
        style={badgeStyle}
        {...(compact ? { role: "img", "aria-label": config.label } : {})}
      >
        {config.icon}
        {!compact && config.label}
      </span>
    </Tooltip>
  );
}
