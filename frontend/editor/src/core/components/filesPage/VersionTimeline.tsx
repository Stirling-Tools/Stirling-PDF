import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActionIcon, Badge, Menu } from "@mantine/core";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import DeleteIcon from "@mui/icons-material/Delete";
import DownloadIcon from "@mui/icons-material/Download";
import HistoryIcon from "@mui/icons-material/History";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";

import { FileId, ToolOperation } from "@app/types/file";
import { ToolId } from "@app/types/toolId";
import { StirlingFileStub } from "@app/types/fileContext";
import { formatFileSize, getFileDate } from "@app/utils/fileUtils";
import { downloadFileFromStorage } from "@app/utils/downloadUtils";
import ToolChain from "@app/components/shared/ToolChain";

/** Small label/value row; shared with FileDetailsPanel. */
export function DetailField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="files-page-details-field">
      <span className="files-page-details-field-label">{label}</span>
      <span className="files-page-details-field-value">{value}</span>
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
}

/** Version timeline with per-row tool deltas and collapse-when-long. */
export function VersionTimeline({
  chain,
  currentId,
  onAddToWorkspace,
  onRemove,
}: VersionTimelineProps) {
  const { t } = useTranslation();
  const [expandedIds, setExpandedIds] = useState<Set<FileId>>(new Set());
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
      return ordered.map((v) => ({ kind: "version", version: v }) as Row);
    }
    const head = ordered
      .slice(0, 3)
      .map((v) => ({ kind: "version", version: v }) as Row);
    const tail = ordered
      .slice(-2)
      .map((v) => ({ kind: "version", version: v }) as Row);
    const hidden = ordered.length - 5;
    return [...head, { kind: "ellipsis", hidden }, ...tail];
  }, [collapsible, showAllCollapsed, ordered]);

  const toggleExpand = (id: FileId) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="files-page-details-version-timeline">
      <div className="files-page-details-version-timeline-label">
        <HistoryIcon fontSize="small" />
        <span>{t("filesPage.field.versionHistory", "Version journey")}</span>
        <span className="files-page-details-version-timeline-count">
          {t("filesPage.versionsCount", "{{count}} versions", {
            count: ordered.length,
          })}
        </span>
      </div>
      <ol className="files-page-details-version-timeline-list">
        {rows.map((row, idx) => {
          const isLast = idx === rows.length - 1;
          if (row.kind === "ellipsis") {
            return (
              <li
                key="ellipsis"
                className="files-page-details-version-timeline-ellipsis"
              >
                <div className="files-page-details-version-timeline-rail">
                  <span className="files-page-details-version-timeline-rail-dot is-ellipsis" />
                  {!isLast && (
                    <span className="files-page-details-version-timeline-rail-line" />
                  )}
                </div>
                <button
                  type="button"
                  className="files-page-details-version-timeline-ellipsis-btn"
                  onClick={() => setShowAllCollapsed(true)}
                >
                  {t(
                    "filesPage.versionShowHidden",
                    "Show {{count}} earlier versions",
                    { count: row.hidden },
                  )}
                </button>
              </li>
            );
          }
          const v = row.version;
          const isActive = v.id === currentId;
          const isExpanded = expandedIds.has(v.id);
          const prior = byVersionNumber.get((v.versionNumber ?? 1) - 1) ?? null;
          const delta = deltaToolFor(v, prior);
          return (
            <li
              key={v.id}
              className={`files-page-details-version-timeline-row${
                isActive ? " is-active" : ""
              }`}
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
                <button
                  type="button"
                  className="files-page-details-version-timeline-summary"
                  onClick={() => toggleExpand(v.id)}
                  aria-expanded={isExpanded}
                >
                  <Badge
                    size="xs"
                    variant={isActive ? "filled" : "outline"}
                    color="blue"
                  >
                    v{v.versionNumber ?? 1}
                  </Badge>
                  {delta ? (
                    <span className="files-page-details-version-timeline-delta">
                      <span className="files-page-details-version-timeline-delta-plus">
                        +
                      </span>
                      <ToolLabel toolId={delta.toolId} />
                    </span>
                  ) : (
                    <span className="files-page-details-version-timeline-delta is-origin">
                      {t("filesPage.versionOrigin", "Original upload")}
                    </span>
                  )}
                  <span className="files-page-details-version-timeline-spacer" />
                  <KeyboardArrowDownIcon
                    className={`files-page-details-version-timeline-chevron${
                      isExpanded ? " is-expanded" : ""
                    }`}
                    fontSize="small"
                  />
                </button>
                <div className="files-page-details-version-timeline-meta-line">
                  <span>{formatFileSize(v.size)}</span>
                  {v.lastModified ? (
                    <>
                      <span>·</span>
                      <span>
                        {getFileDate({ lastModified: v.lastModified })}
                      </span>
                    </>
                  ) : null}
                  {/* Kebab on every row - the original/active version also
                      needs download + open-in-workspace. */}
                  <span className="files-page-details-version-timeline-spacer" />
                  <Menu position="bottom-end" withinPortal shadow="md">
                    <Menu.Target>
                      <ActionIcon
                        variant="subtle"
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
                </div>
                {isExpanded && (
                  // Filename + full cumulative tool chain.
                  <div className="files-page-details-version-timeline-expanded">
                    <DetailField
                      label={t("filesPage.field.name", "Name")}
                      value={v.name}
                    />
                    {v.toolHistory && v.toolHistory.length > 0 && (
                      <div className="files-page-details-version-timeline-toolchain">
                        <span className="files-page-details-version-timeline-toolchain-label">
                          {t(
                            "filesPage.field.toolHistoryAtVersion",
                            "Cumulative tool chain",
                          )}
                        </span>
                        <ToolChain
                          toolChain={v.toolHistory}
                          displayStyle="badges"
                          size="xs"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {collapsible && showAllCollapsed && (
        <button
          type="button"
          className="files-page-details-version-timeline-collapse-btn"
          onClick={() => setShowAllCollapsed(false)}
        >
          {t("filesPage.versionCollapse", "Collapse middle versions")}
        </button>
      )}
    </div>
  );
}
