import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Tier = "free" | "pro" | "enterprise";

export interface TierInfo {
  label: string;
  dotColor: string;
}

export const TIER_INFO: Record<Tier, TierInfo> = {
  free: { label: "Free Plan", dotColor: "var(--color-text-4)" },
  pro: { label: "Pay-as-you-go", dotColor: "var(--color-blue)" },
  enterprise: { label: "Enterprise Plan", dotColor: "var(--color-purple)" },
};

interface TierContextValue {
  tier: Tier;
  setTier: (tier: Tier) => void;
}

const TierContext = createContext<TierContextValue | null>(null);

export function TierProvider({
  children,
  initialTier = "pro",
}: {
  children: ReactNode;
  initialTier?: Tier;
}) {
  const [tier, setTier] = useState<Tier>(initialTier);
  const value = useMemo<TierContextValue>(() => ({ tier, setTier }), [tier]);
  return <TierContext.Provider value={value}>{children}</TierContext.Provider>;
}

export function useTier(): TierContextValue {
  const v = useContext(TierContext);
  if (!v) throw new Error("useTier must be used inside <TierProvider>");
  return v;
}
