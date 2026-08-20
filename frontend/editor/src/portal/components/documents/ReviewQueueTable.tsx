import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  type CellLabel,
  column,
  DataTable,
  type DataTableColumn,
} from "@app/ui";
import {
  classificationTone,
  DOCUMENT_STATUS_LABEL,
  DOCUMENT_STATUS_TONE,
  type ReviewDocument,
} from "@portal/api/documents";

interface ReviewQueueTableProps {
  documents: ReviewDocument[];
  onRowClick: (doc: ReviewDocument) => void;
}

/** The document stream - one row per document your org has processed. */
export function ReviewQueueTable({
  documents,
  onRowClick,
}: ReviewQueueTableProps) {
  const { t } = useTranslation();
  const columns = useMemo<DataTableColumn<ReviewDocument>[]>(
    () => [
      column.entity({
        key: "document",
        header: t("portal.documents.table.columns.document"),
        sortable: true,
        primary: (d) => d.name,
        note: (d) => d.note,
      }),
      column.labels({
        key: "labels",
        header: t("portal.documents.table.columns.labels", "Labels"),
        get: (d) => {
          const out: CellLabel[] = [];
          if (d.classification) {
            out.push({
              label: d.classification,
              accent: classificationTone(d),
            });
          }
          if (d.auto) {
            out.push({
              label: t("portal.documents.table.auto"),
              accent: "success",
            });
          }
          if (d.sensitive) {
            out.push({
              label: t("portal.documents.table.sensitiveLabel"),
              accent: "warning",
            });
          }
          return out;
        },
      }),
      column.text({
        key: "product",
        header: t("portal.documents.table.columns.product"),
        sortable: true,
        get: (d) => d.product,
      }),
      column.text({
        key: "action",
        header: t("portal.documents.table.columns.action"),
        sortable: true,
        get: (d) =>
          d.product === "Editor" || !d.action
            ? t("portal.documents.table.editorAction")
            : d.action,
      }),
      column.muted({
        key: "user",
        header: t("portal.documents.table.columns.user"),
        sortable: true,
        get: (d) => d.user,
      }),
      column.badge({
        key: "status",
        header: t("portal.documents.table.columns.status"),
        sortable: true,
        get: (d) => ({
          tone: DOCUMENT_STATUS_TONE[d.status],
          label:
            t(DOCUMENT_STATUS_LABEL[d.status]) +
            (d.status === "in-review" && d.reviewer ? ` · ${d.reviewer}` : ""),
        }),
      }),
      column.muted({
        key: "time",
        header: t("portal.documents.table.columns.time"),
        get: (d) => d.time,
      }),
      column.actions({
        key: "actions",
        get: (d) => [
          {
            label: t("portal.documents.table.rowActions"),
            glyph: "kebab",
            iconOnly: true,
            onClick: () => onRowClick(d),
          },
        ],
      }),
    ],
    [t, onRowClick],
  );

  return (
    <DataTable<ReviewDocument>
      columns={columns}
      rows={documents}
      rowKey={(d) => d.id}
      onRowClick={onRowClick}
      empty={t("portal.documents.table.empty")}
    />
  );
}
