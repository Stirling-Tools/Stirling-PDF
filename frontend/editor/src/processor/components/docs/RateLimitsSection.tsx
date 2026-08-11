import { useTranslation } from "react-i18next";
import { Card, CodeBlock } from "@app/ui";
import type { RateLimit } from "@processor/api/docs";
import { DocsSection } from "@processor/components/docs/DocsSection";

export function RateLimitsSection({ rateLimit }: { rateLimit: RateLimit }) {
  const { t } = useTranslation();
  return (
    <DocsSection
      id="rate-limits"
      eyebrow={t("processor.docs.rateLimits.eyebrow")}
      title={t("processor.docs.rateLimits.title")}
      lead={t("processor.docs.rateLimits.lead")}
    >
      <div className="processor-docs__limits">
        <Card padding="default">
          <div className="processor-docs__limit-label">
            {t("processor.docs.rateLimits.requestsPerMinute")}
          </div>
          <div className="processor-docs__limit-value">{rateLimit.rpm}</div>
        </Card>
        <Card padding="default">
          <div className="processor-docs__limit-label">
            {t("processor.docs.rateLimits.burst")}
          </div>
          <div className="processor-docs__limit-value">{rateLimit.burst}</div>
        </Card>
        <Card padding="default">
          <div className="processor-docs__limit-label">
            {t("processor.docs.rateLimits.concurrency")}
          </div>
          <div className="processor-docs__limit-value">
            {rateLimit.concurrency}
          </div>
        </Card>
      </div>
      <CodeBlock
        lang="http"
        caption={t("processor.docs.rateLimits.codeCaption")}
        code={`HTTP/1.1 429 Too Many Requests
Retry-After: 2
X-RateLimit-Remaining: 0`}
      />
    </DocsSection>
  );
}
