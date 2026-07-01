import { useTranslation } from "react-i18next";
import { Card, CodeBlock } from "@app/ui";
import { DocsSection } from "@portal/components/docs/DocsSection";

export function WebhooksSection() {
  const { t } = useTranslation();
  return (
    <DocsSection
      id="webhooks"
      eyebrow={t("portal.docs.webhooks.eyebrow")}
      title={t("portal.docs.webhooks.title")}
      lead={t("portal.docs.webhooks.lead")}
    >
      <CodeBlock
        lang="json"
        caption={t("portal.docs.webhooks.codeCaption")}
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
        {t("portal.docs.webhooks.callout.beforeSignature")}{" "}
        <code>Stirling-Signature</code>{" "}
        {t("portal.docs.webhooks.callout.beforeHelper")}{" "}
        <code>verifyWebhook()</code>{" "}
        {t("portal.docs.webhooks.callout.afterHelper")}
      </Card>
    </DocsSection>
  );
}
