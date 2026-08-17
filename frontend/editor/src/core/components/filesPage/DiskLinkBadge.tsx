import { useTranslation } from "react-i18next";
import { Tooltip } from "@mantine/core";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import SyncProblemIcon from "@mui/icons-material/SyncProblem";

import { StirlingFileStub } from "@app/types/fileContext";
import { diskLinkState } from "@app/services/diskFileSync";

/**
 * Says whether a file is still backed by its original on disk.
 *
 * Losing that link, or diverging from it, is a lasting state, but the only
 * thing that ever announced it was a toast - so a few seconds after it happened
 * there was no way to tell an orphaned file from a healthy one, and the file
 * would still look saved while Ctrl+S was quietly about to ask for a new
 * location. This is that state, kept on screen.
 *
 * Nothing is shown for the two ordinary cases - a healthy link, and a file that
 * never came from disk - so the badge only ever appears when something needs
 * attention. `FileOriginBadge` sits next to this and answers a different
 * question (local vs server storage), not this one.
 */
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
      {/* Compact is icon-only, so it needs a name of its own - and aria-label
          is prohibited on a bare span, hence role="img". With the label
          visible the text already names it, and a second aria-label would
          only shadow it. */}
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
