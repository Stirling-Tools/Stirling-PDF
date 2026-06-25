import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Chip,
  StatusBadge,
  type StatusTone,
  Table,
  type TableColumn,
} from "@shared/components";
import type { SourceStatus, SourceView } from "@portal/api/sources";
import { sourceTypeMeta } from "@portal/components/sources/sourceTypes";
import "@portal/views/Sources.css";

const STATUS_TONE: Record<SourceStatus, StatusTone> = {
  active: "success",
  unused: "neutral",
  disabled: "warning",
};

interface SourcesTableProps {
  sources: SourceView[];
  /** Id of the row whose detail panel is open, drives the caret state. */
  expandedId: string | null;
  onRowClick: (source: SourceView) => void;
}

export function SourcesTable({
  sources,
  expandedId,
  onRowClick,
}: SourcesTableProps) {
  const { t } = useTranslation();
  const columns = useMemo<TableColumn<SourceView>[]>(
    () => [
      {
        key: "name",
        header: t("sources.table.source"),
        render: (s) => {
          const meta = sourceTypeMeta(s.type);
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
                <Chip tone={meta.tone} size="sm">
                  {t(meta.labelKey)}
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
            tone={STATUS_TONE[s.status]}
            size="sm"
            pulse={s.status === "active"}
          >
            {t(`sources.status.${s.status}`)}
          </StatusBadge>
        ),
      },
      {
        key: "referenceCount",
        header: t("sources.table.usedBy"),
        align: "right",
        render: (s) => (
          <span
            className={
              s.referenceCount === 0 ? "portal-sources__muted" : undefined
            }
          >
            {s.referenceCount}
          </span>
        ),
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
    <Table<SourceView>
      className="portal-sources__table"
      columns={columns}
      rows={sources}
      rowKey={(s) => s.id}
      onRowClick={onRowClick}
    />
  );
}
