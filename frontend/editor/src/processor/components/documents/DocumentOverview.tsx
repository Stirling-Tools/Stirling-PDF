import { useTranslation } from "react-i18next";
import { StatTile } from "@app/ui";
import {
  DOCUMENT_STATUS_LABEL,
  type ReviewDocument,
} from "@processor/api/documents";

/** Key fields for the selected document - product, action, user, status. */
export function DocumentOverview({ doc }: { doc: ReviewDocument }) {
  const { t } = useTranslation();
  return (
    <div className="processor-documents__overview">
      <div className="processor-documents__stat-grid">
        <StatTile
          label={t("processor.documents.overview.status")}
          value={t(DOCUMENT_STATUS_LABEL[doc.status])}
        />
        <StatTile
          label={t("processor.documents.overview.product")}
          value={doc.product}
        />
        <StatTile
          label={t("processor.documents.overview.action")}
          value={
            doc.product === "Editor" || !doc.action
              ? t("processor.documents.table.editorAction")
              : doc.action
          }
        />
        <StatTile
          label={t("processor.documents.overview.user")}
          value={doc.user || "-"}
        />
        <StatTile
          label={t("processor.documents.overview.type")}
          value={doc.type}
        />
        <StatTile
          label={t("processor.documents.overview.received")}
          value={doc.time}
        />
      </div>
    </div>
  );
}
