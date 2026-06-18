import { Card, CodeBlock } from "@shared/components";
import { DocsSection } from "@portal/components/docs/DocsSection";

export function WebhooksSection() {
  return (
    <DocsSection
      id="webhooks"
      eyebrow="API REFERENCE"
      title="Webhooks"
      lead="Subscribe to document.processed, pipeline.completed, and quota.threshold events. Payloads are signed with HMAC-SHA256."
    >
      <CodeBlock
        lang="json"
        caption="document.processed"
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
        Verify the <code>Stirling-Signature</code> header against your signing
        secret before trusting a payload. SDKs ship a{" "}
        <code>verifyWebhook()</code> helper.
      </Card>
    </DocsSection>
  );
}
