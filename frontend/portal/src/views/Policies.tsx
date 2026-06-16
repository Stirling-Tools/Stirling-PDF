import { useState } from "react";
import { Banner, Skeleton } from "@shared/components";
import { useTier } from "@portal/contexts/TierContext";
import { useAsync, useSectionFlags } from "@portal/hooks/useAsync";
import {
  fetchPolicies,
  tierMeetsRequirement,
  type PoliciesResponse,
  type PolicyCategoryConfig,
} from "@portal/api/policies";
import { SummaryStrip } from "@portal/components/policies/SummaryStrip";
import { PolicyCategoryCard } from "@portal/components/policies/PolicyCategoryCard";
import { PolicyDesigner } from "@portal/components/policies/PolicyDesigner";
import "@portal/views/Policies.css";

export function Policies() {
  const { tier } = useTier();
  const state = useAsync<PoliciesResponse>(() => fetchPolicies(tier), [tier]);
  const { data, loading } = state;
  const { isLoading } = useSectionFlags(state);

  const [editing, setEditing] = useState<PolicyCategoryConfig | null>(null);

  const categories = data?.categories ?? [];

  return (
    <div className="portal-policies">
      <header className="portal-policies__head">
        <h1 className="portal-policies__title">Policies</h1>
        <p className="portal-policies__sub">
          Org-wide standing rules that govern every document, regardless of
          which pipeline processes it. Policies are admin-controlled and apply
          across your whole organisation.
        </p>
      </header>

      <SummaryStrip data={data} loading={loading} />

      {tier === "free" && (
        <Banner
          tone="info"
          title="Some policy categories are locked on the Free plan"
          description="Ingestion and Retention are editable today. Upgrade to unlock Routing, Security and Compliance controls."
        />
      )}

      {isLoading && (
        <div className="portal-policies__grid" aria-hidden>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} height="9rem" />
          ))}
        </div>
      )}

      {!isLoading && categories.length > 0 && (
        <div className="portal-policies__grid">
          {categories.map((config) => (
            <PolicyCategoryCard
              key={config.category}
              config={config}
              editable={tierMeetsRequirement(tier, config.requiredTier)}
              onOpen={setEditing}
            />
          ))}
        </div>
      )}

      <PolicyDesigner config={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
