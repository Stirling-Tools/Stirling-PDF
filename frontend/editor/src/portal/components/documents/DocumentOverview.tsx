import { useTranslation } from "react-i18next";
import { StatTile } from "@app/ui";
import {
  DOCUMENT_STATUS_LABEL,
  type ReviewDocument,
} from "@portal/api/documents";

/** Key fields for the selected document - product, action, user, status. */
export function DocumentOverview({ doc }: { doc: ReviewDocument }) {
  const { t } = useTranslation();
  return (
    <div className="portal-documents__overview">
      <div className="portal-documents__stat-grid">
        <StatTile
          label={t("portal.documents.overview.status")}
          value={DOCUMENT_STATUS_LABEL[doc.status]}
        />
        <StatTile
          label={t("portal.documents.overview.product")}
          value={doc.product}
        />
        <StatTile
          label={t("portal.documents.overview.action")}
          value={
            doc.product === "Editor" || !doc.action ? "Editor" : doc.action
          }
        />
        <StatTile
          label={t("portal.documents.overview.user")}
          value={doc.user || "-"}
        />
        <StatTile
          label={t("portal.documents.overview.type")}
          value={doc.type}
        />
        <StatTile
          label={t("portal.documents.overview.received")}
          value={doc.time}
        />
      </div>
    </div>
  );
}
