import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import AccountTreeRounded from "@mui/icons-material/AccountTreeRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import HistoryRounded from "@mui/icons-material/HistoryRounded";
import {
  Chip,
  StatusBadge,
  type StatusTone,
  Table,
  type TableColumn,
} from "@app/ui";
import type {
  PipelineOrigin,
  PipelineStatus,
  PipelineView,
} from "@portal/api/pipelines";

const STATUS_TONE: Record<PipelineStatus, StatusTone> = {
  active: "success",
  paused: "neutral",
};

const ORIGIN_ICON: Record<PipelineOrigin, typeof HistoryRounded> = {
  migrated: HistoryRounded,
};

/**
 * Says so when a pipeline wasn't built here but converted from a legacy watched-folder config, so
 * one nobody remembers creating isn't mistaken for the team's own work. Renders nothing for the
 * ordinary case.
 */
function OriginChip({ origin }: { origin?: PipelineOrigin | null }) {
  const { t } = useTranslation();
  if (!origin || !(origin in ORIGIN_ICON)) return null;
  const Icon = ORIGIN_ICON[origin];
  return (
    <Chip
      accent="brand"
      size="sm"
      leadingIcon={<Icon style={{ fontSize: "0.875rem" }} />}
      title={t(`portal.pipelines.origin.${origin}.hint`, {
        defaultValue:
          "Converted from a watched-folder JSON config. The original file was archived beside the folder.",
      })}
    >
      {t(`portal.pipelines.origin.${origin}.label`, {
        defaultValue: "Migrated",
      })}
    </Chip>
  );
}

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
              <AccountTreeRounded style={{ fontSize: "1.2rem" }} />
            </span>
            <div className="portal-pipelines__name-text">
              <strong>{p.name}</strong>
              <div className="portal-pipelines__name-chips">
                <Chip accent="neutral" size="sm">
                  {t(`portal.pipelines.trigger.${p.trigger}`, {
                    defaultValue: p.trigger,
                  })}
                </Chip>
                <OriginChip origin={p.origin} />
              </div>
            </div>
          </div>
        ),
      },
      {
        key: "status",
        header: t("portal.pipelines.table.status"),
        render: (p) => (
          <StatusBadge tone={STATUS_TONE[p.status]} size="sm">
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
