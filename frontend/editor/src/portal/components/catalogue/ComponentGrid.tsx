import { type SdkComponent, isUnlocked } from "@portal/api/sdkComponents";
import type { Tier } from "@portal/contexts/TierContext";
import { ComponentCard } from "@portal/components/catalogue/ComponentCard";
import "@portal/views/Components.css";

interface ComponentGridProps {
  components: SdkComponent[];
  tier: Tier;
  onOpen: (component: SdkComponent) => void;
}

/** Responsive grid of catalogue cards; locks components above the tier. */
export function ComponentGrid({
  components,
  tier,
  onOpen,
}: ComponentGridProps) {
  return (
    <div className="portal-components__grid">
      {components.map((c) => (
        <ComponentCard
          key={c.id}
          component={c}
          unlocked={isUnlocked(c, tier)}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}
