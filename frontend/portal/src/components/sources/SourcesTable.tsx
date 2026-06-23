import { useMemo } from "react";
import { Chip, StatusBadge, Table, type TableColumn } from "@shared/components";
import {
  type Source,
  SOURCE_STATUS_TONE,
  SOURCE_TYPE_META,
} from "@portal/api/sources";
import "@portal/views/Sources.css";

interface SourcesTableProps {
  sources: Source[];
  /** Id of the row whose detail panel is open, drives the caret state. */
  expandedId: string | null;
  onRowClick: (source: Source) => void;
}

export function SourcesTable({
  sources,
  expandedId,
  onRowClick,
}: SourcesTableProps) {
  const columns = useMemo<TableColumn<Source>[]>(
    () => [
      {
        key: "name",
        header: "Source",
        render: (s) => {
          const meta = SOURCE_TYPE_META[s.type];
          return (
            <div className="portal-sources__name-cell">
              <span
                className={`portal-sources__type-dot portal-sources__type-dot--${meta.tone}`}
                aria-hidden
              >
                {meta.icon}
              </span>
              <div className="portal-sources__name-text">
                <strong>{s.name}</strong>
                <Chip accent={meta.tone} size="sm">
                  {meta.label}
                </Chip>
              </div>
            </div>
          );
        },
      },
      {
        key: "status",
        header: "Status",
        render: (s) => (
          <StatusBadge
            tone={SOURCE_STATUS_TONE[s.status]}
            size="sm"
            pulse={s.status === "active"}
          >
            {s.status}
          </StatusBadge>
        ),
      },
      {
        key: "docs24h",
        header: "Docs / 24h",
        align: "right",
        render: (s) => s.docs24h.toLocaleString(),
      },
      {
        key: "docs30d",
        header: "Docs / 30d",
        align: "right",
        render: (s) => s.docs30d.toLocaleString(),
      },
      {
        key: "lastEvent",
        header: "Last event",
        render: (s) => (
          <span className="portal-sources__muted">{s.lastEvent}</span>
        ),
      },
      {
        key: "owner",
        header: "Owner",
        render: (s) => <span className="portal-sources__muted">{s.owner}</span>,
      },
      {
        key: "expand",
        header: "",
        align: "right",
        width: "2.5rem",
        render: (s) => (
          <span
            className={
              "portal-sources__caret" + (expandedId === s.id ? " is-open" : "")
            }
            aria-hidden
          >
            ▸
          </span>
        ),
      },
    ],
    [expandedId],
  );

  return (
    <Table<Source>
      className="portal-sources__table"
      columns={columns}
      rows={sources}
      rowKey={(s) => s.id}
      onRowClick={onRowClick}
    />
  );
}
