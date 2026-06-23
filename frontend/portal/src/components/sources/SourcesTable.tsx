import { useMemo } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const columns = useMemo<TableColumn<Source>[]>(
    () => [
      {
        key: "name",
        header: t("sources.table.source"),
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
        header: t("sources.table.status"),
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
        header: t("sources.table.docs24h"),
        align: "right",
        render: (s) => s.docs24h.toLocaleString(),
      },
      {
        key: "docs30d",
        header: t("sources.table.docs30d"),
        align: "right",
        render: (s) => s.docs30d.toLocaleString(),
      },
      {
        key: "lastEvent",
        header: t("sources.table.lastEvent"),
        render: (s) => (
          <span className="portal-sources__muted">{s.lastEvent}</span>
        ),
      },
      {
        key: "owner",
        header: t("sources.table.owner"),
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
    [expandedId, t],
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
