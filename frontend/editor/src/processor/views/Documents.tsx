import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui";
import { useTier } from "@processor/contexts/TierContext";
import { useDocuments } from "@processor/queries/documents";
import {
  DOCUMENT_STATUS_LABEL,
  type ReviewDocument,
} from "@processor/api/documents";
import { ReviewQueue } from "@processor/components/documents/ReviewQueue";
import { FileRunEventList } from "@processor/components/failures/FileRunEventList";
import "@processor/components/failures/failures.css";
import "@processor/views/Documents.css";

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
function toCsv(docs: ReviewDocument[], t: TFunction): string {
  const header = [
    t("processor.documents.table.columns.document"),
    t("processor.documents.table.columns.product"),
    t("processor.documents.table.columns.action"),
    t("processor.documents.table.columns.user"),
    t("processor.documents.table.columns.status"),
    t("processor.documents.table.columns.time"),
  ];
  const lines = [header.map(csvCell).join(",")];
  for (const d of docs) {
    const action =
      d.product === "Editor" || !d.action
        ? t("processor.documents.table.editorAction")
        : d.action;
    const status =
      t(DOCUMENT_STATUS_LABEL[d.status]) +
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
  const state = useDocuments(tier);
  const documents = state.data?.documents ?? [];

  function exportCsv() {
    const blob = new Blob([toCsv(documents, t)], {
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
    <div className="processor-documents">
      <header className="processor-documents__head">
        <div className="processor-documents__head-text">
          <h1 className="processor-documents__title">
            {t("processor.documents.title")}
          </h1>
          <p className="processor-documents__sub">
            {t("processor.documents.subtitle")}
          </p>
        </div>
        <Button
          variant="secondary"
          fat
          leftSection={<DownloadIcon />}
          onClick={exportCsv}
          disabled={documents.length === 0}
        >
          {t("processor.documents.exportCsv")}
        </Button>
      </header>

      <ReviewQueue documents={documents} loading={state.loading} />

      {/* Recorded policy, pipeline and editor failures. DEV ONLY, deliberately: this list is a
          stand-in until failures get their own review screen, and it is not the surface we want to
          ship. The endpoints behind it are live and gated, so nothing here is load-bearing.

          Vite folds this to false in a build, so neither the section nor its fetch ships. The bell's
          "View in processor" action is gated the same way and for the same reason - lift both
          together when the review screen lands, or that button navigates nowhere. */}
      {import.meta.env.DEV && <FileRunEventList />}
    </div>
  );
}
