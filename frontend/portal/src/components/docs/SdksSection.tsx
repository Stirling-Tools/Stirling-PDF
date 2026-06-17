import { Card, CodeBlock, StatusBadge } from "@shared/components";
import type { Sdk, SdkStatus } from "@portal/api/docs";
import { DocsSection } from "@portal/components/docs/DocsSection";

/** GA clients carry no badge; only non-stable maturity is called out. */
const STATUS_BADGE: Partial<
  Record<SdkStatus, { label: string; tone: "info" | "warning" }>
> = {
  beta: { label: "Beta", tone: "info" },
  deprecated: { label: "Deprecated", tone: "warning" },
};

export function SdksSection({ sdks }: { sdks: Sdk[] }) {
  return (
    <DocsSection
      id="sdk-overview"
      eyebrow="SDKS"
      title="Official SDKs"
      lead="First-party clients with typed responses, automatic retries, and streaming uploads. All track the same endpoint catalogue."
    >
      <div className="portal-docs__sdk-grid">
        {sdks.map((sdk) => {
          const badge = STATUS_BADGE[sdk.status];
          return (
            <Card key={sdk.name} padding="default" interactive>
              <div className="portal-docs__sdk-head">
                <span className="portal-docs__sdk-icon" aria-hidden>
                  {sdk.icon}
                </span>
                <h3 className="portal-docs__sdk-name">{sdk.name}</h3>
                {badge && (
                  <StatusBadge tone={badge.tone} size="sm">
                    {badge.label}
                  </StatusBadge>
                )}
              </div>
              <CodeBlock lang={sdk.lang} code={sdk.install} maxHeight={80} />
            </Card>
          );
        })}
      </div>
    </DocsSection>
  );
}
