import { useTranslation } from "react-i18next";
import { Card, CodeBlock } from "@shared/components";
import { DocsSection } from "@portal/components/docs/DocsSection";

export function WebhooksSection() {
  const { t } = useTranslation();
  return (
    <DocsSection
      id="webhooks"
      eyebrow={t("docs.webhooks.eyebrow")}
      title={t("docs.webhooks.title")}
      lead={t("docs.webhooks.lead")}
    >
      <CodeBlock
        lang="json"
        caption={t("docs.webhooks.codeCaption")}
        code={`{
  "event": "document.processed",
  "id": "evt_91ac3f",
  "created": "2026-06-15T09:31:04Z",
  "data": {
    "endpoint": "/v1/invoice",
    "document_id": "doc_77b2",
    "confidence": 0.98
  }
}`}
      />
      <Card className="portal-docs__callout" accent="amber" padding="loose">
        {t("docs.webhooks.callout.beforeSignature")}{" "}
        <code>Stirling-Signature</code>{" "}
        {t("docs.webhooks.callout.beforeHelper")} <code>verifyWebhook()</code>{" "}
        {t("docs.webhooks.callout.afterHelper")}
      </Card>
    </DocsSection>
  );
}
