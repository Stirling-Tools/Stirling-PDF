import { useTranslation } from "react-i18next";
import { StatTile } from "@shared/components";
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
          label={t("documents.overview.status")}
          value={DOCUMENT_STATUS_LABEL[doc.status]}
        />
        <StatTile label={t("documents.overview.type")} value={doc.type} />
        <StatTile
          label={t("documents.overview.confidence")}
          value={confidencePct(doc.confidence)}
        />
        <StatTile
          label={t("documents.overview.fieldsExtracted")}
          value={doc.fieldsExtracted}
        />
        <StatTile label={t("documents.overview.source")} value={doc.source} />
        <StatTile label={t("documents.overview.received")} value={doc.time} />
      </div>
    </div>
  );
}
