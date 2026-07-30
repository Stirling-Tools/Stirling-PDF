import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePlanTier } from "@portal/contexts/usePlanTier";

export type Tier = "free" | "pro" | "enterprise";

export interface TierInfo {
  /** i18n key for the plan label; resolve with `t()` at the call site. */
  labelKey: string;
  dotColor: string;
}

export const TIER_INFO: Record<Tier, TierInfo> = {
  // Matches SaaS branding (editor/cloud Payg + PaygFree): the always-free
  // manual-tools tier is "Editor plan"; the metered tier is "Processor plan".
  free: { labelKey: "portal.tier.free", dotColor: "var(--c-text-subtle)" },
  pro: { labelKey: "portal.tier.pro", dotColor: "var(--c-primary)" },
  enterprise: {
    labelKey: "portal.tier.enterprise",
    dotColor: "var(--color-purple)",
  },
};

interface TierContextValue {
  tier: Tier;
  /** No-op when the tier is derived from the real plan (i.e. in the app). */
  setTier: (tier: Tier) => void;
  /** True when the tier value is derived from the real plan, not pinned. */
  isDerived: boolean;
}

const TierContext = createContext<TierContextValue | null>(null);

export function TierProvider({
  children,
  initialTier,
}: {
  children: ReactNode;
  /**
   * Pins the tier to a fixed, locally settable value. Storybook and demo
   * surfaces pass this to stage a specific tier; the app omits it, so the
   * tier is always derived from the real plan (see usePlanTier — link state
   * self-hosted, wallet on SaaS).
   */
  initialTier?: Tier;
}) {
  const pinned = initialTier !== undefined;
  const [pinnedTier, setPinnedTier] = useState<Tier>(initialTier ?? "free");
  const derivedTier = usePlanTier();

  // Memo on the resolved tier (not its inputs) so plan transitions that map to
  // the same tier don't re-render every consumer.
  const tier = pinned ? pinnedTier : derivedTier;
  const value = useMemo<TierContextValue>(
    () => ({
      tier,
      // Setter is a no-op when derived — UI controls can disable themselves
      // via `isDerived`, but even if one slips through, it has no effect.
      setTier: pinned ? setPinnedTier : () => {},
      isDerived: !pinned,
    }),
    [pinned, tier],
  );

  return <TierContext.Provider value={value}>{children}</TierContext.Provider>;
}

export function useTier(): TierContextValue {
  const v = useContext(TierContext);
  if (!v) throw new Error("useTier must be used inside <TierProvider>");
  return v;
}
