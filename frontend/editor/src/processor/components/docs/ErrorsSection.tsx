import { useTranslation } from "react-i18next";
import { CodeBlock, StatusBadge } from "@app/ui";
import type { ApiErrorRow } from "@processor/api/docs";
import { DocsSection } from "@processor/components/docs/DocsSection";

export function ErrorsSection({ errors }: { errors: ApiErrorRow[] }) {
  const { t } = useTranslation();
  return (
    <DocsSection
      id="errors"
      eyebrow={t("processor.docs.errors.eyebrow")}
      title={t("processor.docs.errors.title")}
      lead={t("processor.docs.errors.lead")}
    >
      <div className="processor-docs__errors">
        {errors.map((e) => (
          <div key={e.code} className="processor-docs__error-row">
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
        caption={t("processor.docs.errors.codeCaption")}
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
