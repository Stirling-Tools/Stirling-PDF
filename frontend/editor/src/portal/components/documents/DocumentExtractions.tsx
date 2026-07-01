import { useTranslation } from "react-i18next";
import { StatusBadge, Table, type TableColumn } from "@shared/components";
import { type Extraction, type ReviewDocument } from "@portal/api/documents";
import {
  confidencePct,
  confidenceTone,
} from "@portal/components/documents/format";

interface DocumentExtractionsProps {
  doc: ReviewDocument;
  /**
   * Whether sensitive content may be shown. A sensitive doc renders its fields
   * only once a timed elevation is active; the gate UI itself lives in the
   * drawer so it can sit above all sub-tabs.
   */
  unlocked: boolean;
}

/** Per-field extraction table, gated behind elevation for sensitive docs. */
export function DocumentExtractions({
  doc,
  unlocked,
}: DocumentExtractionsProps) {
  const { t } = useTranslation();

  const cols: TableColumn<Extraction>[] = [
    {
      key: "field",
      header: t("documents.extractions.columns.field"),
      render: (e) => <span className="portal-documents__field">{e.field}</span>,
    },
    {
      key: "value",
      header: t("documents.extractions.columns.value"),
      render: (e) => <span className="portal-documents__mono">{e.value}</span>,
    },
    {
      key: "confidence",
      header: t("documents.extractions.columns.confidence"),
      align: "right",
      width: "7rem",
      render: (e) => (
        <StatusBadge
          tone={confidenceTone(e.confidence)}
          size="sm"
          showDot={false}
        >
          {confidencePct(e.confidence)}
        </StatusBadge>
      ),
    },
  ];

  if (doc.sensitive && !unlocked) {
    return (
      <div className="portal-documents__masked">
        <span className="portal-documents__masked-icon" aria-hidden>
          🔒
        </span>
        <p className="portal-documents__masked-text">
          {t("documents.extractions.masked")}
        </p>
      </div>
    );
  }

  return (
    <Table<Extraction>
      columns={cols}
      rows={doc.extractions}
      rowKey={(e) => e.field}
      empty={t("documents.extractions.empty")}
    />
  );
}
