import { useState } from "react";
import {
  EmptyState,
  Skeleton,
  StatusBadge,
  Tabs,
  type TabItem,
} from "@shared/components";
import { useAsync, useSectionFlags } from "@portal/hooks/useAsync";
import {
  fetchVerticals,
  type Endpoint,
  type Vertical,
  type VerticalKey,
} from "@portal/api/endpoints";
import "@portal/components/DocumentTypeGrid.css";

type ActiveTab = VerticalKey | "all";

const TIER_LABEL = ["Free", "Paid", "Enterprise"] as const;
const TIER_TONE = ["success", "info", "purple"] as const;

function tierBadge(tier: 0 | 1 | 2) {
  return (
    <StatusBadge tone={TIER_TONE[tier]} size="sm">
      {TIER_LABEL[tier]}
    </StatusBadge>
  );
}

function EndpointCard({
  endpoint,
  vertical,
}: {
  endpoint: Endpoint;
  vertical: Vertical;
}) {
  const visibleRegions = endpoint.regions.slice(0, 2);
  const extraRegions = endpoint.regions.length - visibleRegions.length;
  return (
    <article className="portal-doctype__card">
      <div
        className="portal-doctype__card-accent"
        style={{ background: vertical.color }}
        aria-hidden
      />
      <div className="portal-doctype__card-body">
        <div className="portal-doctype__card-eyebrow">
          {vertical.label.toUpperCase()}
        </div>
        <h3 className="portal-doctype__card-title">{endpoint.name}</h3>
        <p className="portal-doctype__card-desc">{endpoint.desc}</p>
        <div className="portal-doctype__card-meta">
          <span className="portal-doctype__regions">
            {visibleRegions.join(" · ")}
            {extraRegions > 0 && (
              <span className="portal-doctype__regions-more">
                {" "}
                +{extraRegions} more
              </span>
            )}
          </span>
          {tierBadge(endpoint.tier)}
        </div>
        <a
          className="portal-doctype__card-cta"
          style={{ color: vertical.color }}
          href={`#${endpoint.endpoint}`}
          onClick={(e) => e.preventDefault()}
        >
          Explore <span aria-hidden>→</span>
        </a>
      </div>
    </article>
  );
}

function GridSkeleton() {
  return (
    <div className="portal-doctype__groups" aria-hidden>
      {Array.from({ length: 2 }).map((_, gi) => (
        <div key={gi} className="portal-doctype__group">
          <div className="portal-doctype__group-head">
            <Skeleton shape="circle" width="0.4375rem" height="0.4375rem" />
            <Skeleton width="6rem" />
          </div>
          <div className="portal-doctype__scroller">
            {Array.from({ length: 4 }).map((_, ci) => (
              <Skeleton key={ci} shape="rect" width="17rem" height="8rem" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function DocumentTypeGrid() {
  const [tab, setTab] = useState<ActiveTab>("all");
  const state = useAsync<Vertical[]>(() => fetchVerticals(), []);
  const { data: verticals } = state;
  const { isLoading, isEmpty } = useSectionFlags(state);
  const hasVerticals = verticals !== null && verticals.length > 0;

  const tabItems: TabItem<ActiveTab>[] = hasVerticals
    ? [
        { key: "all", label: "All" },
        ...verticals.map<TabItem<ActiveTab>>((v) => ({
          key: v.key,
          label: v.label,
          count: v.endpoints.length,
          accentColor: v.color,
          dotColor: v.color,
        })),
      ]
    : [];

  return (
    <section className="portal-doctype" aria-label="Document types">
      <header className="portal-doctype__head">
        <h2 className="portal-doctype__title">Document types</h2>
        <p className="portal-doctype__sub">
          Typed endpoints across every supported vertical — each carries a
          schema, region availability and tier gate.
        </p>
      </header>

      {hasVerticals && (
        <Tabs<ActiveTab>
          items={tabItems}
          activeKey={tab}
          onChange={setTab}
          ariaLabel="Document type verticals"
        />
      )}

      {isLoading && <GridSkeleton />}

      {isEmpty && (
        <EmptyState
          title="No document types yet"
          description="When endpoints are registered they'll appear in this catalogue."
        />
      )}

      {hasVerticals && (
        <div className="portal-doctype__groups">
          {(tab === "all"
            ? verticals
            : verticals.filter((v) => v.key === tab)
          ).map((v) => (
            <div key={v.key} className="portal-doctype__group">
              {tab === "all" && (
                <div className="portal-doctype__group-head">
                  <span
                    className="portal-doctype__tab-dot"
                    style={{ background: v.color }}
                    aria-hidden
                  />
                  <h3 className="portal-doctype__group-title">{v.label}</h3>
                  <span className="portal-doctype__group-count">
                    {v.endpoints.length} endpoints
                  </span>
                </div>
              )}
              <div className="portal-doctype__scroller">
                {v.endpoints.map((endpoint) => (
                  <EndpointCard
                    key={endpoint.endpoint}
                    endpoint={endpoint}
                    vertical={v}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
