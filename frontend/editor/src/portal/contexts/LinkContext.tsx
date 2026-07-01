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
 * comes from the wallet (api/billing.ts Wallet.status).
 */
export type LinkState = "unlinked" | "linked-free" | "linked-subscribed";

export interface LinkInfo {
  /** i18n key for the badge label; resolve with `t()` at the call site. */
  labelKey: string;
  /** English fallback for {@link labelKey}, passed as the t() default value. */
  labelDefault: string;
  /** Whether billable features are unlocked (any linked state). */
  unlocked: boolean;
}

export const LINK_INFO: Record<LinkState, LinkInfo> = {
  unlinked: {
    labelKey: "accountLink.state.unlinked",
    labelDefault: "Not linked",
    unlocked: false,
  },
  "linked-free": {
    labelKey: "accountLink.state.free",
    labelDefault: "Editor plan",
    unlocked: true,
  },
  "linked-subscribed": {
    labelKey: "accountLink.state.subscribed",
    labelDefault: "Processor plan",
    unlocked: true,
  },
};

interface LinkContextValue {
  linkState: LinkState;
  setLinkState: (state: LinkState) => void;
  /** True for any linked state — gates "link to unlock" prompts. */
  isLinked: boolean;
  /** Convenience for `LINK_INFO[linkState].unlocked` — billable features usable. */
  featuresUnlocked: boolean;
  /**
   * Bumps whenever the browser's SaaS session changes (e.g. a re-sign-in after
   * expiry). Attended SaaS reads (the wallet) key off this to refetch with the
   * fresh token without re-establishing the instance link.
   */
  saasSessionNonce: number;
  markSaasSessionChanged: () => void;
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
  const [saasSessionNonce, setSaasSessionNonce] = useState(0);
  const markSaasSessionChanged = useCallback(
    () => setSaasSessionNonce((n) => n + 1),
    [],
  );
  const value = useMemo<LinkContextValue>(() => {
    const unlocked = LINK_INFO[linkState].unlocked;
    return {
      linkState,
      setLinkState,
      isLinked: linkState !== "unlinked",
      featuresUnlocked: unlocked,
      saasSessionNonce,
      markSaasSessionChanged,
    };
  }, [linkState, saasSessionNonce, markSaasSessionChanged]);
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
