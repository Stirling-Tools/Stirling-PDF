import { useTranslation } from "react-i18next";
import { Card, CodeBlock, StatusBadge } from "@app/ui";
import type { Sdk, SdkStatus } from "@processor/api/docs";
import { DocsSection } from "@processor/components/docs/DocsSection";

/** GA clients carry no badge; only non-stable maturity is called out. */
const STATUS_BADGE: Partial<
  Record<SdkStatus, { labelKey: string; tone: "info" | "warning" }>
> = {
  beta: { labelKey: "processor.docs.sdks.status.beta", tone: "info" },
  deprecated: {
    labelKey: "processor.docs.sdks.status.deprecated",
    tone: "warning",
  },
};

export function SdksSection({ sdks }: { sdks: Sdk[] }) {
  const { t } = useTranslation();
  return (
    <DocsSection
      id="sdk-overview"
      eyebrow={t("processor.docs.sdks.eyebrow")}
      title={t("processor.docs.sdks.title")}
      lead={t("processor.docs.sdks.lead")}
    >
      <div className="processor-docs__sdk-grid">
        {sdks.map((sdk) => {
          const badge = STATUS_BADGE[sdk.status];
          return (
            <Card key={sdk.name} padding="default" interactive>
              <div className="processor-docs__sdk-head">
                <span className="processor-docs__sdk-icon" aria-hidden>
                  {sdk.icon}
                </span>
                <h3 className="processor-docs__sdk-name">{sdk.name}</h3>
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
