import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import {
  Chip,
  StatusBadge,
  type StatusTone,
  Table,
  type TableColumn,
} from "@app/ui";
import type { PipelineStatus, PipelineView } from "@portal/api/pipelines";

const STATUS_TONE: Record<PipelineStatus, StatusTone> = {
  active: "success",
  paused: "neutral",
};

interface PipelinesTableProps {
  pipelines: PipelineView[];
  /** A row opens that pipeline's own page. */
  onRowClick: (pipeline: PipelineView) => void;
}

export function PipelinesTable({ pipelines, onRowClick }: PipelinesTableProps) {
  const { t } = useTranslation();
  const columns = useMemo<TableColumn<PipelineView>[]>(
    () => [
      {
        key: "name",
        header: t("portal.pipelines.table.name"),
        render: (p) => (
          <div className="portal-pipelines__name-cell">
            <span className="portal-pipelines__pipe-dot" aria-hidden>
              ⛓
            </span>
            <div className="portal-pipelines__name-text">
              <strong>{p.name}</strong>
              <Chip tone="neutral" size="sm">
                {t(`portal.pipelines.trigger.${p.trigger}`, {
                  defaultValue: p.trigger,
                })}
              </Chip>
            </div>
          </div>
        ),
      },
      {
        key: "status",
        header: t("portal.pipelines.table.status"),
        render: (p) => (
          <StatusBadge
            tone={STATUS_TONE[p.status]}
            size="sm"
            pulse={p.status === "active"}
          >
            {t(`portal.pipelines.status.${p.status}`)}
          </StatusBadge>
        ),
      },
      {
        key: "steps",
        header: t("portal.pipelines.table.steps"),
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
        header: t("portal.pipelines.table.sources"),
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
        key: "open",
        header: "",
        align: "right",
        width: "2.5rem",
        render: () => (
          <span className="portal-pipelines__caret" aria-hidden>
            <ChevronRightRoundedIcon style={{ fontSize: "1.25rem" }} />
          </span>
        ),
      },
    ],
    [t],
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
