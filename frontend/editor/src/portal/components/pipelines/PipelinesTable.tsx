import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  type CellLabel,
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
  // No converted pipeline means no Origin column at all, rather than a header
  // over a column of empty cells.
  const hasMigrated = pipelines.some((p) => p.origin === "migrated");
  const columns = useMemo<DataTableColumn<PipelineView>[]>(
    () => [
      column.entity({
        key: "name",
        header: t("portal.pipelines.table.name"),
        sortable: true,
        icon: (p) => pipelineIcon(p.icon, "1.25rem"),
        primary: (p) => p.name,
      }),
      ...(hasMigrated
        ? [
            // Marks a pipeline converted from a legacy config, so it isn't
            // taken for the team's own work.
            column.labels<PipelineView>({
              key: "origin",
              header: t("portal.pipelines.table.origin", "Origin"),
              get: (p) => {
                const out: CellLabel[] = [];
                if (p.origin === "migrated") {
                  out.push({
                    label: t("portal.pipelines.origin.migrated.label", {
                      defaultValue: "Migrated",
                    }),
                    accent: "brand",
                    title: t("portal.pipelines.origin.migrated.hint", {
                      defaultValue:
                        "Converted from a watched-folder JSON config. The original file was archived beside the folder.",
                    }),
                  });
                }
                return out;
              },
            }),
          ]
        : []),
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
    [t, hasMigrated],
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
