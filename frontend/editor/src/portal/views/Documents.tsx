import { useTranslation } from "react-i18next";
import { ReviewQueue } from "@portal/components/documents/ReviewQueue";
import "@portal/views/Documents.css";

/**
 * Documents surface — the review/approval queue: documents flowing through the
 * org's pipelines awaiting a decision, with filters, a detail drawer, and
 * zero-standing-access elevation for sensitive files.
 */
export function Documents() {
  const { t } = useTranslation();
  return (
    <div className="portal-documents">
      <header className="portal-documents__head">
        <h1 className="portal-documents__title">{t("documents.title")}</h1>
        <p className="portal-documents__sub">{t("documents.subtitle")}</p>
      </header>

      <ReviewQueue />
    </div>
  );
}
