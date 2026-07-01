import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  MethodBadge,
  Tabs,
  type HttpMethod,
  type TabItem,
} from "@shared/components";
import { VERTICALS, ALL_ENDPOINTS } from "@shared/data/endpoints";
import { DocsSection } from "@portal/components/docs/DocsSection";

type VerticalFilter = "all" | (typeof VERTICALS)[number]["key"];

export function EndpointReferenceSection() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<VerticalFilter>("all");

  const tabItems: TabItem<VerticalFilter>[] = [
    {
      key: "all",
      label: t("docs.endpoints.filterAll"),
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
      eyebrow={t("docs.endpoints.eyebrow")}
      title={t("docs.endpoints.title")}
      lead={t("docs.endpoints.lead")}
    >
      <Tabs
        items={tabItems}
        activeKey={filter}
        onChange={setFilter}
        ariaLabel={t("docs.endpoints.filterAriaLabel")}
      />
      <div className="portal-docs__endpoints">
        {shown.map((v) => (
          <div key={v.key} className="portal-docs__endpoint-group">
            <div className="portal-docs__endpoint-grouphead">
              <span
                className="portal-docs__endpoint-dot"
                style={{ background: v.color }}
                aria-hidden
              />
              {v.label}
            </div>
            {v.endpoints.map((e) => (
              <div key={e.endpoint} className="portal-docs__endpoint-row">
                <MethodBadge method={"POST" as HttpMethod} />
                <code className="portal-docs__endpoint-path">{e.endpoint}</code>
                <span className="portal-docs__endpoint-name">{e.name}</span>
                <span className="portal-docs__endpoint-fields">
                  {t("docs.endpoints.fieldCount", {
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
