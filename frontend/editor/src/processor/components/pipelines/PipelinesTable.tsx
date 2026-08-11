import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import AccountTreeRounded from "@mui/icons-material/AccountTreeRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import {
  Chip,
  StatusBadge,
  type StatusTone,
  Table,
  type TableColumn,
} from "@app/ui";
import type { PipelineStatus, PipelineView } from "@processor/api/pipelines";

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
        header: t("processor.pipelines.table.name"),
        render: (p) => (
          <div className="processor-pipelines__name-cell">
            <span className="processor-pipelines__pipe-dot" aria-hidden>
              <AccountTreeRounded style={{ fontSize: "1.2rem" }} />
            </span>
            <div className="processor-pipelines__name-text">
              <strong>{p.name}</strong>
              <Chip accent="neutral" size="sm">
                {t(`processor.pipelines.trigger.${p.trigger}`, {
                  defaultValue: p.trigger,
                })}
              </Chip>
            </div>
          </div>
        ),
      },
      {
        key: "status",
        header: t("processor.pipelines.table.status"),
        render: (p) => (
          <StatusBadge tone={STATUS_TONE[p.status]} size="sm">
            {t(`processor.pipelines.status.${p.status}`)}
          </StatusBadge>
        ),
      },
      {
        key: "steps",
        header: t("processor.pipelines.table.steps"),
        align: "right",
        render: (p) => (
          <span
            className={
              p.steps.length === 0 ? "processor-pipelines__muted" : undefined
            }
          >
            {p.steps.length}
          </span>
        ),
      },
      {
        key: "sources",
        header: t("processor.pipelines.table.sources"),
        align: "right",
        render: (p) => (
          <span
            className={
              p.sources.length === 0 ? "processor-pipelines__muted" : undefined
            }
          >
            {p.sources.length}
          </span>
        ),
      },
      {
        key: "open",
        header: t("processor.pipelines.table.open"),
        headerHidden: true,
        align: "right",
        width: "2.5rem",
        render: () => (
          <span className="processor-pipelines__caret" aria-hidden>
            <ChevronRightRoundedIcon style={{ fontSize: "1.25rem" }} />
          </span>
        ),
      },
    ],
    [t],
  );

  return (
    <Table<PipelineView>
      className="processor-pipelines__table"
      columns={columns}
      rows={pipelines}
      rowKey={(p) => p.id}
      onRowClick={onRowClick}
    />
  );
}
