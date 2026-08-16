import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { MethodBadge, Tabs, type HttpMethod, type TabItem } from "@app/ui";
import { VERTICALS, ALL_ENDPOINTS } from "@processor/data/endpoints";
import { DocsSection } from "@processor/components/docs/DocsSection";
import "@processor/theme/surface.css";

type VerticalFilter = "all" | (typeof VERTICALS)[number]["key"];

export function EndpointReferenceSection() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<VerticalFilter>("all");

  const tabItems: TabItem<VerticalFilter>[] = [
    {
      key: "all",
      label: t("processor.docs.endpoints.filterAll"),
      count: ALL_ENDPOINTS.length,
    },
    ...VERTICALS.map<TabItem<VerticalFilter>>((v) => ({
      key: v.key,
      label: v.label,
      count: v.endpoints.length,
      dotColor: v.color,
      accentColor: v.color,
    })),
  ];

  const shown = useMemo(
    () =>
      filter === "all" ? VERTICALS : VERTICALS.filter((v) => v.key === filter),
    [filter],
  );

  return (
    <DocsSection
      id="endpoints"
      eyebrow={t("processor.docs.endpoints.eyebrow")}
      title={t("processor.docs.endpoints.title")}
      lead={t("processor.docs.endpoints.lead")}
    >
      <Tabs
        items={tabItems}
        activeKey={filter}
        onChange={setFilter}
        ariaLabel={t("processor.docs.endpoints.filterAriaLabel")}
      />
      <div className="processor-docs__endpoints">
        {shown.map((v) => (
          <div
            key={v.key}
            className="processor-surface processor-docs__endpoint-group"
          >
            <div className="processor-docs__endpoint-grouphead">
              <span
                className="processor-docs__endpoint-dot"
                style={{ background: v.color }}
                aria-hidden
              />
              {v.label}
            </div>
            {v.endpoints.map((e) => (
              <div key={e.endpoint} className="processor-docs__endpoint-row">
                <MethodBadge method={"POST" as HttpMethod} />
                <code className="processor-docs__endpoint-path">
                  {e.endpoint}
                </code>
                <span className="processor-docs__endpoint-name">{e.name}</span>
                <span className="processor-docs__endpoint-fields">
                  {t("processor.docs.endpoints.fieldCount", {
                    count: Object.keys(e.schema).length,
                  })}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </DocsSection>
  );
}
