import { useTranslation } from "react-i18next";
import { StatTile } from "@app/ui";
import {
  DOCUMENT_STATUS_LABEL,
  type ReviewDocument,
} from "@portal/api/documents";
import { confidencePct } from "@portal/components/documents/format";

/** Key fields for the selected document — status, source, confidence. */
export function DocumentOverview({ doc }: { doc: ReviewDocument }) {
  const { t } = useTranslation();
  return (
    <div className="portal-documents__overview">
      <div className="portal-documents__stat-grid">
        <StatTile
          label={t("portal.documents.overview.status")}
          value={t(DOCUMENT_STATUS_LABEL[doc.status])}
        />
        <StatTile
          label={t("portal.documents.overview.type")}
          value={doc.type}
        />
        <StatTile
          label={t("portal.documents.overview.confidence")}
          value={confidencePct(doc.confidence)}
        />
        <StatTile
          label={t("portal.documents.overview.fieldsExtracted")}
          value={doc.fieldsExtracted}
        />
        <StatTile
          label={t("portal.documents.overview.source")}
          value={doc.source}
        />
        <StatTile
          label={t("portal.documents.overview.received")}
          value={doc.time}
        />
      </div>
    </div>
  );
}
