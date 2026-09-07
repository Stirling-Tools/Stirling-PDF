import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  column,
  DataTable,
  type DataTableColumn,
  type StatusTone,
} from "@app/ui";
import { pipelineIcon } from "@portal/components/pipelines/pipelineIcon";
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
  const columns = useMemo<DataTableColumn<PipelineView>[]>(
    () => [
      column.entity({
        key: "name",
        header: t("portal.pipelines.table.name"),
        sortable: true,
        icon: (p) => pipelineIcon(p.icon, "1.25rem"),
        primary: (p) => p.name,
      }),
      column.text({
        key: "type",
        header: t("portal.pipelines.table.type", "Type"),
        sortable: true,
        get: (p) =>
          p.required
            ? t("portal.pipelines.type.policy")
            : t("portal.pipelines.type.pipeline"),
      }),
      column.text({
        key: "trigger",
        header: t("portal.pipelines.table.trigger", "Trigger"),
        sortable: true,
        get: (p) =>
          t(`portal.pipelines.trigger.${p.trigger}`, {
            defaultValue: p.trigger,
          }),
      }),
      column.badge({
        key: "status",
        header: t("portal.pipelines.table.status"),
        sortable: true,
        get: (p) => ({
          tone: STATUS_TONE[p.status],
          label: t(`portal.pipelines.status.${p.status}`),
        }),
      }),
      column.number({
        key: "steps",
        header: t("portal.pipelines.table.steps"),
        sortable: true,
        get: (p) => p.steps.length,
      }),
      column.number({
        key: "sources",
        header: t("portal.pipelines.table.sources"),
        sortable: true,
        get: (p) => p.sources.length,
      }),
    ],
    [t],
  );

  return (
    <DataTable<PipelineView>
      columns={columns}
      rows={pipelines}
      rowKey={(p) => p.id}
      onRowClick={onRowClick}
      rowAffordance="chevron"
    />
  );
}
