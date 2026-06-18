import { useMemo } from "react";
import {
  ProgressBar,
  StatusBadge,
  Table,
  type TableColumn,
} from "@shared/components";
import {
  DOCUMENT_STATUS_LABEL,
  DOCUMENT_STATUS_TONE,
  type ReviewDocument,
} from "@portal/api/documents";
import {
  confidencePct,
  confidenceTone,
} from "@portal/components/documents/format";

interface ReviewQueueTableProps {
  documents: ReviewDocument[];
  onRowClick: (doc: ReviewDocument) => void;
}

/** The document stream — one row per document awaiting a review decision. */
export function ReviewQueueTable({
  documents,
  onRowClick,
}: ReviewQueueTableProps) {
  const columns = useMemo<TableColumn<ReviewDocument>[]>(
    () => [
      {
        key: "name",
        header: "Name",
        render: (d) => (
          <div className="portal-documents__name-cell">
            <span className="portal-documents__name">{d.name}</span>
            {d.sensitive && (
              <span
                className="portal-documents__lock"
                title="Sensitive — access required"
                aria-label="Sensitive"
              >
                🔒
              </span>
            )}
          </div>
        ),
      },
      { key: "type", header: "Type", render: (d) => d.type },
      {
        key: "status",
        header: "Status",
        render: (d) => (
          <StatusBadge tone={DOCUMENT_STATUS_TONE[d.status]} size="sm">
            {DOCUMENT_STATUS_LABEL[d.status]}
          </StatusBadge>
        ),
      },
      {
        key: "source",
        header: "Source",
        render: (d) => (
          <span className="portal-documents__muted">{d.source}</span>
        ),
      },
      {
        key: "confidence",
        header: "Confidence",
        width: "9rem",
        render: (d) => (
          <div className="portal-documents__confidence">
            <ProgressBar value={d.confidence} height={6} />
            <span
              className={`portal-documents__confidence-pct portal-documents__confidence-pct--${confidenceTone(
                d.confidence,
              )}`}
            >
              {confidencePct(d.confidence)}
            </span>
          </div>
        ),
      },
      {
        key: "fields",
        header: "Fields",
        align: "right",
        render: (d) => (
          <span className="portal-documents__mono">{d.fieldsExtracted}</span>
        ),
      },
      {
        key: "time",
        header: "Time",
        align: "right",
        render: (d) => (
          <span className="portal-documents__muted">{d.time}</span>
        ),
      },
    ],
    [],
  );

  return (
    <Table<ReviewDocument>
      className="portal-documents__table"
      columns={columns}
      rows={documents}
      rowKey={(d) => d.id}
      onRowClick={onRowClick}
      empty="No documents match this filter."
    />
  );
}
