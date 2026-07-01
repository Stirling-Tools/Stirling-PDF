import { useTranslation } from "react-i18next";
import { CodeBlock, StatusBadge } from "@shared/components";
import type { ApiErrorRow } from "@portal/api/docs";
import { DocsSection } from "@portal/components/docs/DocsSection";

export function ErrorsSection({ errors }: { errors: ApiErrorRow[] }) {
  const { t } = useTranslation();
  return (
    <DocsSection
      id="errors"
      eyebrow={t("docs.errors.eyebrow")}
      title={t("docs.errors.title")}
      lead={t("docs.errors.lead")}
    >
      <div className="portal-docs__errors">
        {errors.map((e) => (
          <div key={e.code} className="portal-docs__error-row">
            <StatusBadge
              tone={e.tone === "red" ? "danger" : "warning"}
              size="sm"
            >
              {e.code}
            </StatusBadge>
            <span>{e.meaning}</span>
          </div>
        ))}
      </div>
      <CodeBlock
        lang="json"
        caption={t("docs.errors.codeCaption")}
        code={`{
  "error": "schema_validation_failed",
  "message": "Field 'total' could not be located",
  "request_id": "req_3f8a91c2",
  "endpoint": "/v1/invoice"
}`}
      />
    </DocsSection>
  );
}
