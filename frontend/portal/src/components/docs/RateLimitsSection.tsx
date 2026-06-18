import { Card, CodeBlock } from "@shared/components";
import type { RateLimit } from "@portal/api/docs";
import { DocsSection } from "@portal/components/docs/DocsSection";

export function RateLimitsSection({ rateLimit }: { rateLimit: RateLimit }) {
  return (
    <DocsSection
      id="rate-limits"
      eyebrow="GETTING STARTED"
      title="Rate limits & quotas"
      lead="Limits scale with your plan. A 429 response includes a Retry-After header; the SDKs back off automatically."
    >
      <div className="portal-docs__limits">
        <Card padding="default">
          <div className="portal-docs__limit-label">Requests / minute</div>
          <div className="portal-docs__limit-value">{rateLimit.rpm}</div>
        </Card>
        <Card padding="default">
          <div className="portal-docs__limit-label">Burst</div>
          <div className="portal-docs__limit-value">{rateLimit.burst}</div>
        </Card>
        <Card padding="default">
          <div className="portal-docs__limit-label">Concurrency</div>
          <div className="portal-docs__limit-value">
            {rateLimit.concurrency}
          </div>
        </Card>
      </div>
      <CodeBlock
        lang="http"
        caption="429 Too Many Requests"
        code={`HTTP/1.1 429 Too Many Requests
Retry-After: 2
X-RateLimit-Remaining: 0`}
      />
    </DocsSection>
  );
}
