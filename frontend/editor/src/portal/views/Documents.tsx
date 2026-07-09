import { useTranslation } from "react-i18next";
import { Button } from "@app/ui";
import { useTier } from "@portal/contexts/TierContext";
import { useAsync } from "@portal/hooks/useAsync";
import {
  fetchDocuments,
  DOCUMENT_STATUS_LABEL,
  type DocumentsResponse,
  type ReviewDocument,
} from "@portal/api/documents";
import { ReviewQueue } from "@portal/components/documents/ReviewQueue";
import "@portal/views/Documents.css";

function DownloadIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/** Flatten the visible columns to CSV, matching the on-screen table. */
function toCsv(docs: ReviewDocument[]): string {
  const header = [
    "Document",
    "Product",
    "Pipeline / Action",
    "User",
    "Status",
    "Time",
  ];
  const lines = [header.map(csvCell).join(",")];
  for (const d of docs) {
    const action = d.product === "Editor" || !d.action ? "Editor" : d.action;
    const status =
      DOCUMENT_STATUS_LABEL[d.status] +
      (d.status === "in-review" && d.reviewer ? ` · ${d.reviewer}` : "");
    lines.push(
      [d.name, d.product, action, d.user || "", status, d.time]
        .map((v) => csvCell(String(v)))
        .join(","),
    );
  }
  return lines.join("\n");
}

/**
 * Documents surface - the processing record for every file the org has run,
 * with status filters, a filename search, a CSV export, and a detail drawer
 * (content is request-gated behind zero-standing-access for sensitive files).
 */
export function Documents() {
  const { t } = useTranslation();
  const { tier } = useTier();
  const state = useAsync<DocumentsResponse>(() => fetchDocuments(tier), [tier]);
  const documents = state.data?.documents ?? [];

  function exportCsv() {
    const blob = new Blob([toCsv(documents)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "documents.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="portal-documents">
      <header className="portal-documents__head">
        <div className="portal-documents__head-text">
          <h1 className="portal-documents__title">
            {t("portal.documents.title")}
          </h1>
          <p className="portal-documents__sub">
            {t("portal.documents.subtitle")}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          leftSection={<DownloadIcon />}
          onClick={exportCsv}
          disabled={documents.length === 0}
        >
          {t("portal.documents.exportCsv")}
        </Button>
      </header>

      <ReviewQueue documents={documents} loading={state.loading} />
    </div>
  );
}
