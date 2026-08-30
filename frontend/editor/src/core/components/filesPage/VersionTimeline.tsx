import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Group, Menu, Text } from "@mantine/core";
import { Button } from "@app/ui/Button";
import { ActionIcon } from "@app/ui/ActionIcon";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import DeleteIcon from "@mui/icons-material/Delete";
import DownloadIcon from "@mui/icons-material/Download";
import HistoryIcon from "@mui/icons-material/History";
import MoreVertIcon from "@mui/icons-material/MoreVert";

import { FileId, ToolOperation } from "@app/types/file";
import { ToolId } from "@app/types/toolId";
import { StirlingFileStub } from "@app/types/fileContext";
import { formatFileSize, getFileDate } from "@app/utils/fileUtils";
import { downloadFileFromStorage } from "@app/utils/downloadUtils";

/** Small label/value row with crisp flex alignment and colon separation. */
export function DetailField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div
      className="files-page-details-field"
      style={{
        display: "flex",
        gap: "0.5rem",
        alignItems: "baseline",
        wordBreak: "break-all",
      }}
    >
      <span
        className="files-page-details-field-label"
        style={{
          fontWeight: 500,
          color: "var(--c-text-subtle)",
          flexShrink: 0,
        }}
      >
        {label}:
      </span>
      <span
        className="files-page-details-field-value"
        style={{ fontWeight: 600, color: "var(--c-text)" }}
      >
        {value}
      </span>
    </div>
  );
}

/** Tool that produced `version` from `prior`; null for v1. */
function deltaToolFor(
  version: StirlingFileStub,
  prior: StirlingFileStub | null,
): ToolOperation | null {
  if (!prior) return null;
  const priorLen = prior.toolHistory?.length ?? 0;
  const curr = version.toolHistory ?? [];
  return curr[priorLen] ?? null;
}

/** Translated tool name via `home.{toolId}.title`. */
function ToolLabel({ toolId }: { toolId: ToolId }) {
  const { t } = useTranslation();
  return <span>{t(`home.${toolId}.title`, toolId)}</span>;
}

export interface VersionTimelineProps {
  /** Chain sorted oldest-first. */
  chain: StirlingFileStub[];
  /** Currently selected version. */
  currentId: FileId;
  onAddToWorkspace: (fileIds: FileId[]) => void;
  onRemove: (fileIds: FileId[]) => void;
  hideHeader?: boolean;
}

/** Clean, spacious version timeline with minimal clutter. */
export function VersionTimeline({
  chain,
  currentId,
  onAddToWorkspace,
  onRemove,
  hideHeader = false,
}: VersionTimelineProps) {
  const { t } = useTranslation();
  const [showAllCollapsed, setShowAllCollapsed] = useState(false);

  // Newest-first ordering.
  const ordered = useMemo(
    () =>
      [...chain].sort(
        (a, b) => (b.versionNumber ?? 1) - (a.versionNumber ?? 1),
      ),
    [chain],
  );

  // Index by versionNumber for prior-version lookup.
  const byVersionNumber = useMemo(() => {
    const map = new Map<number, StirlingFileStub>();
    for (const v of chain) {
      map.set(v.versionNumber ?? 1, v);
    }
    return map;
  }, [chain]);

  // Collapse middle when long: 3 newest + ellipsis + 2 oldest.
  const COLLAPSE_THRESHOLD = 6;
  const collapsible = ordered.length > COLLAPSE_THRESHOLD;
  type Row =
    | { kind: "version"; version: StirlingFileStub }
    | {
        kind: "ellipsis";
        hidden: number;
      };
  const rows: Row[] = useMemo(() => {
    if (!collapsible || showAllCollapsed) {
      return ordered.map<Row>((v) => ({ kind: "version", version: v }));
    }
    const head = ordered
      .slice(0, 3)
      .map<Row>((v) => ({ kind: "version", version: v }));
    const tail = ordered
      .slice(-2)
      .map<Row>((v) => ({ kind: "version", version: v }));
    const hidden = ordered.length - 5;
    return [...head, { kind: "ellipsis", hidden }, ...tail];
  }, [collapsible, showAllCollapsed, ordered]);

  return (
    <div className="files-page-details-version-timeline">
      {!hideHeader && (
        <div className="files-page-details-version-timeline-label">
          <HistoryIcon fontSize="small" />
          <span>{t("filesPage.field.versionHistory", "Version journey")}</span>
          <span className="files-page-details-version-timeline-count">
            {t("filesPage.versionsCount", "{{count}} versions", {
              count: ordered.length,
            })}
          </span>
        </div>
      )}
      <ul
        className="files-page-details-version-timeline-list"
        style={{ listStyle: "none", padding: 0, margin: 0 }}
      >
        {rows.map((row, idx) => {
          const isLast = idx === rows.length - 1;
          if (row.kind === "ellipsis") {
            return (
              <li
                key="ellipsis"
                className="files-page-details-version-timeline-ellipsis"
                style={{ listStyle: "none" }}
              >
                <div className="files-page-details-version-timeline-rail">
                  <span className="files-page-details-version-timeline-rail-dot is-ellipsis" />
                  {!isLast && (
                    <span className="files-page-details-version-timeline-rail-line" />
                  )}
                </div>
                <Button
                  variant="tertiary"
                  size="sm"
                  onClick={() => setShowAllCollapsed(true)}
                >
                  {t(
                    "filesPage.versionShowHidden",
                    "Show {{count}} earlier versions",
                    { count: row.hidden },
                  )}
                </Button>
              </li>
            );
          }
          const v = row.version;
          const isActive = v.id === currentId;
          const prior = byVersionNumber.get((v.versionNumber ?? 1) - 1) ?? null;
          const delta = deltaToolFor(v, prior);
          const isOriginal = (v.versionNumber ?? 1) === 1;
          const nameChanged = prior ? prior.name !== v.name : false;

          return (
            <li
              key={v.id}
              className={`files-page-details-version-timeline-row${
                isActive ? " is-active" : ""
              }`}
              style={{ listStyle: "none" }}
            >
              <div className="files-page-details-version-timeline-rail">
                <span
                  className={`files-page-details-version-timeline-rail-dot${
                    isActive ? " is-active" : ""
                  }`}
                />
                {!isLast && (
                  <span className="files-page-details-version-timeline-rail-line" />
                )}
              </div>
              <div className="files-page-details-version-timeline-body">
                {/* Header row: Version Badge, Action Title + Menu */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "0.75rem",
                    width: "100%",
                  }}
                >
                  <Group
                    gap="sm"
                    align="center"
                    style={{ flex: 1, minWidth: 0, flexWrap: "nowrap" }}
                  >
                    <Badge
                      size="xs"
                      variant={isActive ? "filled" : "light"}
                      styles={
                        isActive
                          ? {
                              root: {
                                backgroundColor: "var(--c-accent-solid)",
                              },
                              label: { color: "var(--c-text-on-primary)" },
                            }
                          : undefined
                      }
                    >
                      v{v.versionNumber ?? 1}
                    </Badge>
                    <Text
                      fw={600}
                      size="sm"
                      truncate
                      style={{ color: "var(--c-text)" }}
                    >
                      {delta ? (
                        <ToolLabel toolId={delta.toolId} />
                      ) : (
                        t("filesPage.versionOrigin", "Original upload")
                      )}
                    </Text>
                  </Group>

                  {!isActive && (
                    <Menu position="bottom-end" withinPortal shadow="md">
                      <Menu.Target>
                        <ActionIcon
                          variant="tertiary"
                          size="sm"
                          aria-label={t(
                            "filesPage.versionActions",
                            "Version actions",
                          )}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertIcon fontSize="small" />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item
                          leftSection={<OpenInNewIcon fontSize="small" />}
                          onClick={() => onAddToWorkspace([v.id])}
                        >
                          {t(
                            "filesPage.openVersionInWorkspace",
                            "Open in workspace",
                          )}
                        </Menu.Item>
                        <Menu.Item
                          leftSection={<DownloadIcon fontSize="small" />}
                          onClick={() => {
                            void downloadFileFromStorage(v);
                          }}
                        >
                          {t(
                            "filesPage.downloadVersion",
                            "Download this version",
                          )}
                        </Menu.Item>
                        <Menu.Divider />
                        <Menu.Item
                          color="red"
                          leftSection={<DeleteIcon fontSize="small" />}
                          onClick={() => onRemove([v.id])}
                        >
                          {t("filesPage.removeVersion", "Remove this version")}
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  )}
                </div>

                {/* Quiet Meta Line: File Size · Date */}
                <Text size="xs" c="dimmed" style={{ marginTop: "0.15rem" }}>
                  {formatFileSize(v.size)}
                  {v.lastModified && (
                    <> · {getFileDate({ lastModified: v.lastModified })}</>
                  )}
                </Text>

                {/* Show filename ONLY if original upload or if name changed */}
                {(isOriginal || nameChanged) && (
                  <Text
                    size="xs"
                    c="dimmed"
                    style={{ wordBreak: "break-all", marginTop: "0.2rem" }}
                  >
                    {nameChanged
                      ? `${t("filesPage.renamed", "Renamed")}: `
                      : `${t("filesPage.file", "File")}: `}
                    <span style={{ color: "var(--c-text)", fontWeight: 500 }}>
                      {v.name}
                    </span>
                  </Text>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {collapsible && showAllCollapsed && (
        <Button
          variant="tertiary"
          size="sm"
          onClick={() => setShowAllCollapsed(false)}
        >
          {t("filesPage.versionCollapse", "Collapse middle versions")}
        </Button>
      )}
    </div>
  );
}
