import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  column,
  DataTable,
  type DataTableColumn,
  type StatusTone,
} from "@app/ui";
import type { SourceStatus, SourceView } from "@portal/api/sources";
import {
  EDITOR_SOURCE_TYPE,
  sourceTypeMeta,
} from "@portal/components/sources/sourceTypes";
import { SourceTypeIcon } from "@portal/components/sources/SourceTypeIcon";

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
        header: t("portal.sources.table.source"),
        icon: (s) => <SourceTypeIcon type={s.type} />,
        // The editor is a system source with no instance name: label it from its
        // type and drop the chip, which would just repeat the name.
        primary: (s) =>
          s.type === EDITOR_SOURCE_TYPE
            ? t(sourceTypeMeta(s.type).labelKey)
            : s.name,
        tags: (s) => {
          if (s.type === EDITOR_SOURCE_TYPE) return [];
          const meta = sourceTypeMeta(s.type);
          return [{ label: t(meta.labelKey), accent: meta.accent }];
        },
      }),
      column.badge({
        key: "status",
        header: t("portal.sources.table.status"),
        get: (s) => ({
          tone: STATUS_TONE[s.status],
          label: t(`portal.sources.status.${s.status}`),
        }),
      }),
      column.number({
        key: "docs",
        header: t("portal.sources.table.documents"),
        get: (s) => s.docsTotal,
        format: (n) => n.toLocaleString(),
      }),
      column.number({
        key: "referenceCount",
        header: t("portal.sources.table.usedBy"),
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
