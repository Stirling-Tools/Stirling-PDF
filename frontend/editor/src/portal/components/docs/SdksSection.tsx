import { useTranslation } from "react-i18next";
import { Card, CodeBlock, StatusBadge } from "@shared/components";
import type { Sdk, SdkStatus } from "@portal/api/docs";
import { DocsSection } from "@portal/components/docs/DocsSection";

/** GA clients carry no badge; only non-stable maturity is called out. */
const STATUS_BADGE: Partial<
  Record<SdkStatus, { labelKey: string; tone: "info" | "warning" }>
> = {
  beta: { labelKey: "docs.sdks.status.beta", tone: "info" },
  deprecated: { labelKey: "docs.sdks.status.deprecated", tone: "warning" },
};

export function SdksSection({ sdks }: { sdks: Sdk[] }) {
  const { t } = useTranslation();
  return (
    <DocsSection
      id="sdk-overview"
      eyebrow={t("docs.sdks.eyebrow")}
      title={t("docs.sdks.title")}
      lead={t("docs.sdks.lead")}
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
                    {t(badge.labelKey)}
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
