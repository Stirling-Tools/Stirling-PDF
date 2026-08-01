import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import LockRounded from "@mui/icons-material/LockRounded";
import { Button, Chip, StatusBadge, Table, type TableColumn } from "@app/ui";
import {
  classificationTone,
  DOCUMENT_STATUS_LABEL,
  DOCUMENT_STATUS_TONE,
  PRODUCT_CHIP_TONE,
  type ReviewDocument,
} from "@portal/api/documents";

interface ReviewQueueTableProps {
  documents: ReviewDocument[];
  onRowClick: (doc: ReviewDocument) => void;
}

function BoltIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
    </svg>
  );
}

function KebabIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <circle cx="12" cy="5" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="19" r="1.6" />
    </svg>
  );
}

/** The document stream - one row per document your org has processed. */
export function ReviewQueueTable({
  documents,
  onRowClick,
}: ReviewQueueTableProps) {
  const { t } = useTranslation();
  const columns = useMemo<TableColumn<ReviewDocument>[]>(
    () => [
      {
        key: "document",
        header: t("portal.documents.table.columns.document"),
        render: (d) => (
          <div className="portal-documents__doc-cell">
            <div className="portal-documents__doc-head">
              <span className="portal-documents__name">{d.name}</span>
              {d.classification && (
                <Chip accent={classificationTone(d)} size="sm">
                  {d.classification}
                </Chip>
              )}
              {d.auto && (
                <Chip accent="success" size="sm" leadingIcon={<BoltIcon />}>
                  {t("portal.documents.table.auto")}
                </Chip>
              )}
              {d.sensitive && (
                <span
                  className="portal-documents__lock"
                  title={t("portal.documents.table.sensitiveTitle")}
                  aria-label={t("portal.documents.table.sensitiveLabel")}
                >
                  <LockRounded style={{ fontSize: "0.95rem" }} />
                </span>
              )}
            </div>
            {d.note && <span className="portal-documents__note">{d.note}</span>}
          </div>
        ),
      },
      {
        key: "product",
        header: t("portal.documents.table.columns.product"),
        width: "7rem",
        render: (d) => (
          <Chip accent={PRODUCT_CHIP_TONE[d.product]} size="sm" showDot={false}>
            {d.product}
          </Chip>
        ),
      },
      {
        key: "action",
        header: t("portal.documents.table.columns.action"),
        width: "12rem",
        render: (d) =>
          d.product === "Editor" || !d.action ? (
            <span className="portal-documents__editor-action">
              {t("portal.documents.table.editorAction")}
            </span>
          ) : (
            <span className="portal-documents__action">{d.action}</span>
          ),
      },
      {
        key: "user",
        header: t("portal.documents.table.columns.user"),
        width: "8rem",
        render: (d) => (
          <span className="portal-documents__muted">{d.user || "-"}</span>
        ),
      },
      {
        key: "status",
        header: t("portal.documents.table.columns.status"),
        width: "10rem",
        render: (d) => (
          <StatusBadge tone={DOCUMENT_STATUS_TONE[d.status]} size="sm">
            {t(DOCUMENT_STATUS_LABEL[d.status])}
            {d.status === "in-review" && d.reviewer ? ` · ${d.reviewer}` : ""}
          </StatusBadge>
        ),
      },
      {
        key: "time",
        header: t("portal.documents.table.columns.time"),
        width: "7rem",
        render: (d) => (
          <span className="portal-documents__muted">{d.time}</span>
        ),
      },
      {
        key: "actions",
        header: "",
        width: "3rem",
        render: (d) => (
          <Button
            variant="quiet"
            size="sm"
            shape="circle"
            leftSection={<KebabIcon />}
            aria-label={t("portal.documents.table.rowActions")}
            onClick={(e) => {
              e.stopPropagation();
              onRowClick(d);
            }}
          />
        ),
      },
    ],
    [t, onRowClick],
  );

  return (
    <Table<ReviewDocument>
      className="portal-documents__table"
      columns={columns}
      rows={documents}
      rowKey={(d) => d.id}
      onRowClick={onRowClick}
      empty={t("portal.documents.table.empty")}
    />
  );
}
