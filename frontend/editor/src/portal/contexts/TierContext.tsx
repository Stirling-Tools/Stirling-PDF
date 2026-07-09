import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { readMocksPreference } from "@portal/mocks/preference";
import { usePlanTier } from "@portal/contexts/usePlanTier";

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
  /** No-op when MSW mocks are off (tier is derived from real link state). */
  setTier: (tier: Tier) => void;
  /** True when the tier value is derived from the real wallet/link, not the dropdown. */
  isDerived: boolean;
}

const TierContext = createContext<TierContextValue | null>(null);

export function TierProvider({
  children,
  initialTier = "pro",
}: {
  children: ReactNode;
  initialTier?: Tier;
}) {
  // Mocks toggling reloads the page (see MocksToggle), so a single read at mount
  // is correct — the preference can't change without us remounting.
  const mocksOn = useMemo(() => readMocksPreference(), []);
  // Real derived tier. Its source is a per-flavor seam: self-hosted derives it
  // from the link/subscription state, SaaS from the wallet (see usePlanTier).
  const derivedTier = usePlanTier();

  const [mockTier, setMockTier] = useState<Tier>(initialTier);

  // When mocks are off, mirror the derived tier so any component keyed on `tier`
  // (sidebar plan badge, gated panels) stays consistent. When mocks are on, the
  // dropdown wins.
  useEffect(() => {
    if (!mocksOn) {
      setMockTier(derivedTier);
    }
  }, [mocksOn, derivedTier]);

  const value = useMemo<TierContextValue>(
    () => ({
      tier: mocksOn ? mockTier : derivedTier,
      // Setter is a no-op when mocks are off — UI controls can disable themselves
      // via `isDerived`, but even if one slips through, it has no effect.
      setTier: mocksOn ? setMockTier : () => {},
      isDerived: !mocksOn,
    }),
    [mocksOn, mockTier, derivedTier],
  );

  return <TierContext.Provider value={value}>{children}</TierContext.Provider>;
}

export function useTier(): TierContextValue {
  const v = useContext(TierContext);
  if (!v) throw new Error("useTier must be used inside <TierProvider>");
  return v;
}
