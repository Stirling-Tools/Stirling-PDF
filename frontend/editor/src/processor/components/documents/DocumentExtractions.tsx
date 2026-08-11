import { useTranslation } from "react-i18next";
import LockRounded from "@mui/icons-material/LockRounded";
import { StatusBadge, Table, type TableColumn } from "@app/ui";
import { type Extraction, type ReviewDocument } from "@processor/api/documents";
import {
  confidencePct,
  confidenceTone,
} from "@processor/components/documents/format";

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
      header: t("processor.documents.extractions.columns.field"),
      render: (e) => (
        <span className="processor-documents__field">{e.field}</span>
      ),
    },
    {
      key: "value",
      header: t("processor.documents.extractions.columns.value"),
      render: (e) => (
        <span className="processor-documents__mono">{e.value}</span>
      ),
    },
    {
      key: "confidence",
      header: t("processor.documents.extractions.columns.confidence"),
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
      <div className="processor-documents__masked">
        <span className="processor-documents__masked-icon" aria-hidden>
          <LockRounded style={{ fontSize: "1.5rem" }} />
        </span>
        <p className="processor-documents__masked-text">
          {t("processor.documents.extractions.masked")}
        </p>
      </div>
    );
  }

  return (
    <Table<Extraction>
      columns={cols}
      rows={doc.extractions}
      rowKey={(e) => e.field}
      empty={t("processor.documents.extractions.empty")}
    />
  );
}
