import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLink, type LinkState } from "@portal/contexts/LinkContext";

export type Tier = "free" | "pro" | "enterprise";

export interface TierInfo {
  label: string;
  dotColor: string;
}

export const TIER_INFO: Record<Tier, TierInfo> = {
  // Matches SaaS branding (editor/cloud Payg + PaygFree): the always-free
  // manual-tools tier is "Editor plan"; the metered tier is "Processor plan".
  free: { label: "Editor plan", dotColor: "var(--color-text-4)" },
  pro: { label: "Processor plan", dotColor: "var(--color-blue)" },
  enterprise: { label: "Enterprise plan", dotColor: "var(--color-purple)" },
};

interface TierContextValue {
  tier: Tier;
  /** No-op when the tier is derived from real link state (i.e. in the app). */
  setTier: (tier: Tier) => void;
  /** True when the tier value is derived from the real wallet/link, not pinned. */
  isDerived: boolean;
}

const TierContext = createContext<TierContextValue | null>(null);

/** Maps the real link/subscription state onto the tier the rest of the portal reads. */
function tierFromLinkState(linkState: LinkState): Tier {
  switch (linkState) {
    case "linked-subscribed":
      return "pro";
    case "linked-free":
    case "unlinked":
      return "free";
  }
}

export function TierProvider({
  children,
  initialTier,
}: {
  children: ReactNode;
  /**
   * Pins the tier to a fixed, locally settable value. Storybook and demo
   * surfaces pass this to stage a specific tier; the app omits it, so the
   * tier is always derived from the real link/subscription state.
   */
  initialTier?: Tier;
}) {
  const pinned = initialTier !== undefined;
  const { linkState } = useLink();
  const [pinnedTier, setPinnedTier] = useState<Tier>(initialTier ?? "free");

  const value = useMemo<TierContextValue>(
    () => ({
      tier: pinned ? pinnedTier : tierFromLinkState(linkState),
      // Setter is a no-op when derived — UI controls can disable themselves
      // via `isDerived`, but even if one slips through, it has no effect.
      setTier: pinned ? setPinnedTier : () => {},
      isDerived: !pinned,
    }),
    [pinned, pinnedTier, linkState],
  );

  return <TierContext.Provider value={value}>{children}</TierContext.Provider>;
}

export function useTier(): TierContextValue {
  const v = useContext(TierContext);
  if (!v) throw new Error("useTier must be used inside <TierProvider>");
  return v;
}
