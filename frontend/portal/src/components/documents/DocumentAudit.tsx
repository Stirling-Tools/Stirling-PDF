import { useTranslation } from "react-i18next";
import { StatusBadge } from "@shared/components";
import {
  DOC_AUDIT_LABEL,
  DOC_AUDIT_TONE,
  type ReviewDocument,
} from "@portal/api/documents";

/** Lifecycle timeline for a single document, oldest first. */
export function DocumentAudit({ doc }: { doc: ReviewDocument }) {
  const { t } = useTranslation();
  if (doc.audit.length === 0) {
    return (
      <p className="portal-documents__muted">{t("documents.audit.empty")}</p>
    );
  }
  return (
    <ol className="portal-documents__timeline">
      {doc.audit.map((event) => (
        <li key={event.id} className="portal-documents__timeline-item">
          <span className="portal-documents__timeline-dot" aria-hidden />
          <div className="portal-documents__timeline-body">
            <div className="portal-documents__timeline-head">
              <StatusBadge tone={DOC_AUDIT_TONE[event.kind]} size="sm">
                {DOC_AUDIT_LABEL[event.kind]}
              </StatusBadge>
              <span className="portal-documents__timeline-time">
                {event.time}
              </span>
            </div>
            <p className="portal-documents__timeline-detail">{event.detail}</p>
            <span className="portal-documents__timeline-actor">
              {event.actor}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}
