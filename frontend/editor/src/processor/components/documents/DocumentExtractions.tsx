import { useTranslation } from "react-i18next";
import LockRounded from "@mui/icons-material/LockRounded";
import { column, DataTable, type DataTableColumn } from "@app/ui";
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

  const cols: DataTableColumn<Extraction>[] = [
    column.text({
      key: "field",
      header: t("processor.documents.extractions.columns.field"),
      sortable: true,
      get: (e) => e.field,
    }),
    column.mono({
      key: "value",
      header: t("processor.documents.extractions.columns.value"),
      get: (e) => e.value,
    }),
    column.badge({
      key: "confidence",
      header: t("processor.documents.extractions.columns.confidence"),
      sortable: true,
      // Sort on the whole-percent integer, not the "92%" label (keeps decimals
      // out of the natural-sort comparator).
      sortBy: (e) => Math.round(e.confidence * 100),
      get: (e) => ({
        tone: confidenceTone(e.confidence),
        label: confidencePct(e.confidence),
      }),
    }),
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
    <DataTable<Extraction>
      columns={cols}
      rows={doc.extractions}
      rowKey={(e) => e.field}
      empty={t("processor.documents.extractions.empty")}
    />
  );
}
