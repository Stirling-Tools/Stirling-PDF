import { ReviewQueue } from "@portal/components/documents/ReviewQueue";
import "@portal/views/Documents.css";

/**
 * Documents surface — the review/approval queue: documents flowing through the
 * org's pipelines awaiting a decision, with filters, a detail drawer, and
 * zero-standing-access elevation for sensitive files.
 */
export function Documents() {
  return (
    <div className="portal-documents">
      <header className="portal-documents__head">
        <h1 className="portal-documents__title">Documents</h1>
        <p className="portal-documents__sub">
          Review and approve documents moving through your pipelines.
        </p>
      </header>

      <ReviewQueue />
    </div>
  );
}
