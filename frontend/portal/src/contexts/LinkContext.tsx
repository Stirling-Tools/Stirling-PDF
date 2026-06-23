import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * The "linked" dimension of the account-link surface (combined-billing "Mode A"),
 * a sibling to TierContext. It answers one question the rest of the portal asks:
 * has this self-hosted org linked its SaaS account, and if so, is it on the free
 * grant or actively subscribed?
 *
 *   - `unlinked`          — no SaaS account linked. Billable features render a
 *                           "link to unlock" affordance.
 *   - `linked-free`       — linked, running on the one-time free grant (500 PDFs).
 *   - `linked-subscribed` — linked with a live PAYG subscription.
 *
 * The portal admin establishes the link by signing in to the SaaS Supabase
 * project in-app (auth/saasSupabase.ts + the shared Supabase login) and
 * registering the instance (api/link.ts); the subscribed-vs-free distinction
 * comes from the wallet contract (api/usage.ts WalletContract.subscriptionStatus).
 */
export type LinkState = "unlinked" | "linked-free" | "linked-subscribed";

export interface LinkInfo {
  label: string;
  /** Whether billable features are unlocked (any linked state). */
  unlocked: boolean;
}

export const LINK_INFO: Record<LinkState, LinkInfo> = {
  unlinked: { label: "Not linked", unlocked: false },
  "linked-free": { label: "Linked · Free grant", unlocked: true },
  "linked-subscribed": { label: "Linked · Pay-as-you-go", unlocked: true },
};

interface LinkContextValue {
  linkState: LinkState;
  setLinkState: (state: LinkState) => void;
  /** True for any linked state — gates "link to unlock" prompts. */
  isLinked: boolean;
  /** Convenience for `LINK_INFO[linkState].unlocked` — billable features usable. */
  featuresUnlocked: boolean;
}

const LinkContext = createContext<LinkContextValue | null>(null);

export function LinkProvider({
  children,
  initialState = "unlinked",
}: {
  children: ReactNode;
  initialState?: LinkState;
}) {
  const [linkState, setLinkState] = useState<LinkState>(initialState);
  const value = useMemo<LinkContextValue>(() => {
    const unlocked = LINK_INFO[linkState].unlocked;
    return {
      linkState,
      setLinkState,
      isLinked: linkState !== "unlinked",
      featuresUnlocked: unlocked,
    };
  }, [linkState]);
  return <LinkContext.Provider value={value}>{children}</LinkContext.Provider>;
}

export function useLink(): LinkContextValue {
  const v = useContext(LinkContext);
  if (!v) throw new Error("useLink must be used inside <LinkProvider>");
  return v;
}

/**
 * Derives the linked state from raw facts: whether the org has linked its SaaS
 * account and whether it carries a live subscription. Keeps the unlinked /
 * linked-free / linked-subscribed mapping in one place.
 */
export function deriveLinkState(
  linked: boolean,
  subscribed: boolean,
): LinkState {
  if (!linked) return "unlinked";
  return subscribed ? "linked-subscribed" : "linked-free";
}

/** Hook returning a setter that maps raw link/subscription facts to LinkState. */
export function useApplyLinkFacts(): (
  linked: boolean,
  subscribed: boolean,
) => void {
  const { setLinkState } = useLink();
  return useCallback(
    (linked: boolean, subscribed: boolean) =>
      setLinkState(deriveLinkState(linked, subscribed)),
    [setLinkState],
  );
}
