import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Banner, EmptyState, Skeleton } from "@shared/components";
import { useTier } from "@portal/contexts/TierContext";
import { useAsync, useSectionFlags } from "@portal/hooks/useAsync";
import {
  fetchComponents,
  isUnlocked,
  type ComponentsResponse,
  type SdkComponent,
} from "@portal/api/sdkComponents";
import { ComponentsSummaryStrip } from "@portal/components/catalogue/ComponentsSummaryStrip";
import { ComponentGrid } from "@portal/components/catalogue/ComponentGrid";
import { ComponentDetailModal } from "@portal/components/catalogue/ComponentDetailModal";
import "@portal/views/Components.css";

export function Components() {
  const { t } = useTranslation();
  const { tier } = useTier();
  const state = useAsync<ComponentsResponse>(
    () => fetchComponents(tier),
    [tier],
  );
  const { data, loading } = state;
  const { isLoading, isEmpty } = useSectionFlags(state);

  const [openId, setOpenId] = useState<string | null>(null);

  const components = data?.components ?? [];
  const open = components.find((c) => c.id === openId) ?? null;
  const hasLocked = components.some((c) => !isUnlocked(c, tier));

  function handleOpen(component: SdkComponent) {
    setOpenId(component.id);
  }

  return (
    <div className="portal-components">
      <header className="portal-components__head">
        <div>
          <h1 className="portal-components__title">
            {t("componentsView.title")}
          </h1>
          <p className="portal-components__sub">
            {t("componentsView.subtitle")}
          </p>
        </div>
      </header>

      <ComponentsSummaryStrip data={data} loading={loading} />

      {tier === "free" && hasLocked && (
        <Banner
          tone="info"
          title={t("componentsView.lockedBanner.title")}
          description={t("componentsView.lockedBanner.description")}
        />
      )}

      {isLoading && (
        <div className="portal-components__grid-skeleton" aria-hidden>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} height="11rem" />
          ))}
        </div>
      )}

      {isEmpty && (
        <EmptyState
          title={t("componentsView.empty.title")}
          description={t("componentsView.empty.description")}
        />
      )}

      {!isLoading && !isEmpty && components.length > 0 && (
        <ComponentGrid
          components={components}
          tier={tier}
          onOpen={handleOpen}
        />
      )}

      <ComponentDetailModal
        component={open}
        unlocked={open ? isUnlocked(open, tier) : false}
        onClose={() => setOpenId(null)}
      />
    </div>
  );
}
