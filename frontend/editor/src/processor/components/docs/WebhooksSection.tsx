import { useTranslation } from "react-i18next";
import { Card, CodeBlock } from "@app/ui";
import { DocsSection } from "@processor/components/docs/DocsSection";

export function WebhooksSection() {
  const { t } = useTranslation();
  return (
    <DocsSection
      id="webhooks"
      eyebrow={t("processor.docs.webhooks.eyebrow")}
      title={t("processor.docs.webhooks.title")}
      lead={t("processor.docs.webhooks.lead")}
    >
      <CodeBlock
        lang="json"
        caption={t("processor.docs.webhooks.codeCaption")}
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
      <Card
        className="processor-docs__callout"
        accent="warning"
        padding="loose"
      >
        {t("processor.docs.webhooks.callout.beforeSignature")}{" "}
        <code>Stirling-Signature</code>{" "}
        {t("processor.docs.webhooks.callout.beforeHelper")}{" "}
        <code>verifyWebhook()</code>{" "}
        {t("processor.docs.webhooks.callout.afterHelper")}
      </Card>
    </DocsSection>
  );
}
