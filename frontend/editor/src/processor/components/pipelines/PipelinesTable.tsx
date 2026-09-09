import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  column,
  DataTable,
  type DataTableColumn,
  type StatusTone,
} from "@app/ui";
import { pipelineIcon } from "@processor/components/pipelines/pipelineIcon";
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
  const columns = useMemo<DataTableColumn<PipelineView>[]>(
    () => [
      column.entity({
        key: "name",
        header: t("processor.pipelines.table.name"),
        sortable: true,
        icon: (p) => pipelineIcon(p.icon, "1.25rem"),
        primary: (p) => p.name,
      }),
      column.text({
        key: "type",
        header: t("processor.pipelines.table.type", "Type"),
        sortable: true,
        get: (p) =>
          p.required
            ? t("processor.pipelines.type.policy")
            : t("processor.pipelines.type.pipeline"),
      }),
      column.text({
        key: "trigger",
        header: t("processor.pipelines.table.trigger", "Trigger"),
        sortable: true,
        get: (p) =>
          t(`processor.pipelines.trigger.${p.trigger}`, {
            defaultValue: p.trigger,
          }),
      }),
      column.badge({
        key: "status",
        header: t("processor.pipelines.table.status"),
        sortable: true,
        get: (p) => ({
          tone: STATUS_TONE[p.status],
          label: t(`processor.pipelines.status.${p.status}`),
        }),
      }),
      column.number({
        key: "steps",
        header: t("processor.pipelines.table.steps"),
        sortable: true,
        get: (p) => p.steps.length,
      }),
      column.number({
        key: "sources",
        header: t("processor.pipelines.table.sources"),
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
