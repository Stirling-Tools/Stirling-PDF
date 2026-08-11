import { useTranslation } from "react-i18next";
import { StatusBadge } from "@app/ui";
import {
  DOC_AUDIT_LABEL,
  DOC_AUDIT_TONE,
  type ReviewDocument,
} from "@processor/api/documents";

/** Lifecycle timeline for a single document, oldest first. */
export function DocumentAudit({ doc }: { doc: ReviewDocument }) {
  const { t } = useTranslation();
  if (doc.audit.length === 0) {
    return (
      <p className="processor-documents__muted">
        {t("processor.documents.audit.empty")}
      </p>
    );
  }
  return (
    <ol className="processor-documents__timeline">
      {doc.audit.map((event) => (
        <li key={event.id} className="processor-documents__timeline-item">
          <span className="processor-documents__timeline-dot" aria-hidden />
          <div className="processor-documents__timeline-body">
            <div className="processor-documents__timeline-head">
              <StatusBadge tone={DOC_AUDIT_TONE[event.kind]} size="sm">
                {t(DOC_AUDIT_LABEL[event.kind])}
              </StatusBadge>
              <span className="processor-documents__timeline-time">
                {event.time}
              </span>
            </div>
            <p className="processor-documents__timeline-detail">
              {event.detail}
            </p>
            <span className="processor-documents__timeline-actor">
              {event.actor}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}
