import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  column,
  DataTable,
  type DataTableColumn,
  type StatusTone,
} from "@app/ui";
import type { SourceStatus, SourceView } from "@processor/api/sources";
import {
  EDITOR_SOURCE_TYPE,
  sourceTypeMeta,
} from "@processor/components/sources/sourceTypes";
import { SourceTypeIcon } from "@processor/components/sources/SourceTypeIcon";

const STATUS_TONE: Record<SourceStatus, StatusTone> = {
  active: "success",
  unused: "neutral",
  disabled: "warning",
};

interface SourcesTableProps {
  sources: SourceView[];
  /** Opens a source's own page. Not called for the virtual editor row. */
  onRowClick: (source: SourceView) => void;
}

export function SourcesTable({ sources, onRowClick }: SourcesTableProps) {
  const { t } = useTranslation();
  const columns = useMemo<DataTableColumn<SourceView>[]>(
    () => [
      column.entity({
        key: "name",
        header: t("processor.sources.table.source"),
        sortable: true,
        icon: (s) => <SourceTypeIcon type={s.type} />,
        // The editor is a system source with no instance name: label it from its
        // type (and leave its Type cell blank, so it isn't repeated).
        primary: (s) =>
          s.type === EDITOR_SOURCE_TYPE
            ? t(sourceTypeMeta(s.type).labelKey)
            : s.name,
      }),
      column.text({
        key: "type",
        header: t("processor.sources.table.type", "Type"),
        sortable: true,
        get: (s) =>
          s.type === EDITOR_SOURCE_TYPE
            ? ""
            : t(sourceTypeMeta(s.type).labelKey),
      }),
      column.badge({
        key: "status",
        header: t("processor.sources.table.status"),
        sortable: true,
        get: (s) => ({
          tone: STATUS_TONE[s.status],
          label: t(`processor.sources.status.${s.status}`),
        }),
      }),
      column.number({
        key: "docs",
        header: t("processor.sources.table.documents"),
        sortable: true,
        get: (s) => s.docsTotal,
        format: (n) => n.toLocaleString(),
      }),
      column.number({
        key: "referenceCount",
        header: t("processor.sources.table.usedBy"),
        sortable: true,
        get: (s) => s.referenceCount,
      }),
    ],
    [t],
  );

  return (
    <DataTable<SourceView>
      columns={columns}
      rows={sources}
      rowKey={(s) => s.id}
      onRowClick={onRowClick}
      // The virtual editor row has no page to open, so it's inert (and gets no
      // chevron) - not a fake button.
      isRowInteractive={(s) => s.type !== EDITOR_SOURCE_TYPE}
      rowAffordance="chevron"
    />
  );
}
