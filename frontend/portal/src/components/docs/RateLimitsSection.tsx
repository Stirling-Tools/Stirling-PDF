import { useTranslation } from "react-i18next";
import { Card, CodeBlock } from "@shared/components";
import type { RateLimit } from "@portal/api/docs";
import { DocsSection } from "@portal/components/docs/DocsSection";

export function RateLimitsSection({ rateLimit }: { rateLimit: RateLimit }) {
  const { t } = useTranslation();
  return (
    <DocsSection
      id="rate-limits"
      eyebrow={t("docs.rateLimits.eyebrow")}
      title={t("docs.rateLimits.title")}
      lead={t("docs.rateLimits.lead")}
    >
      <div className="portal-docs__limits">
        <Card padding="default">
          <div className="portal-docs__limit-label">
            {t("docs.rateLimits.requestsPerMinute")}
          </div>
          <div className="portal-docs__limit-value">{rateLimit.rpm}</div>
        </Card>
        <Card padding="default">
          <div className="portal-docs__limit-label">
            {t("docs.rateLimits.burst")}
          </div>
          <div className="portal-docs__limit-value">{rateLimit.burst}</div>
        </Card>
        <Card padding="default">
          <div className="portal-docs__limit-label">
            {t("docs.rateLimits.concurrency")}
          </div>
          <div className="portal-docs__limit-value">
            {rateLimit.concurrency}
          </div>
        </Card>
      </div>
      <CodeBlock
        lang="http"
        caption={t("docs.rateLimits.codeCaption")}
        code={`HTTP/1.1 429 Too Many Requests
Retry-After: 2
X-RateLimit-Remaining: 0`}
      />
    </DocsSection>
  );
}
