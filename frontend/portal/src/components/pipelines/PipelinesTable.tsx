import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Chip,
  StatusBadge,
  type StatusTone,
  Table,
  type TableColumn,
} from "@shared/components";
import type { PipelineStatus, PipelineView } from "@portal/api/pipelines";

const STATUS_TONE: Record<PipelineStatus, StatusTone> = {
  active: "success",
  paused: "neutral",
};

interface PipelinesTableProps {
  pipelines: PipelineView[];
  /** Id of the row whose detail panel is open, drives the caret state. */
  expandedId: string | null;
  onRowClick: (pipeline: PipelineView) => void;
}

export function PipelinesTable({
  pipelines,
  expandedId,
  onRowClick,
}: PipelinesTableProps) {
  const { t } = useTranslation();
  const columns = useMemo<TableColumn<PipelineView>[]>(
    () => [
      {
        key: "name",
        header: t("pipelines.table.name"),
        render: (p) => (
          <div className="portal-pipelines__name-cell">
            <span className="portal-pipelines__pipe-dot" aria-hidden>
              ⛓
            </span>
            <div className="portal-pipelines__name-text">
              <strong>{p.name}</strong>
              <Chip tone="neutral" size="sm">
                {t(`pipelines.trigger.${p.trigger}`, {
                  defaultValue: p.trigger,
                })}
              </Chip>
            </div>
          </div>
        ),
      },
      {
        key: "status",
        header: t("pipelines.table.status"),
        render: (p) => (
          <StatusBadge
            tone={STATUS_TONE[p.status]}
            size="sm"
            pulse={p.status === "active"}
          >
            {t(`pipelines.status.${p.status}`)}
          </StatusBadge>
        ),
      },
      {
        key: "steps",
        header: t("pipelines.table.steps"),
        align: "right",
        render: (p) => (
          <span
            className={
              p.steps.length === 0 ? "portal-pipelines__muted" : undefined
            }
          >
            {p.steps.length}
          </span>
        ),
      },
      {
        key: "sources",
        header: t("pipelines.table.sources"),
        align: "right",
        render: (p) => (
          <span
            className={
              p.sources.length === 0 ? "portal-pipelines__muted" : undefined
            }
          >
            {p.sources.length}
          </span>
        ),
      },
      {
        key: "expand",
        header: "",
        align: "right",
        width: "2.5rem",
        render: (p) => (
          <span
            className={
              "portal-pipelines__caret" +
              (expandedId === p.id ? " is-open" : "")
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
    <Table<PipelineView>
      className="portal-pipelines__table"
      columns={columns}
      rows={pipelines}
      rowKey={(p) => p.id}
      onRowClick={onRowClick}
    />
  );
}
