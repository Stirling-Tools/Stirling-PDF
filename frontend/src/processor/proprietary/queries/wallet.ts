import type { UseQueryOptions } from "@tanstack/react-query";
import { qk } from "@app/portal/queries/keys";
import { fetchWallet, type Wallet } from "@app/portal/api/billing";

/** How often a reader re-reads the wallet while its tab is in front. */
export const WALLET_POLL_MS = 30_000;

/**
 * One definition for every wallet reader. The billing page and the sidebar's
 * credits row share a cache entry, and per-observer options are resolved
 * per-observer: divergent retry or interval settings on the same key mean the
 * behaviour depends on which one happened to fetch.
 */
export function walletQuery(
  linked: boolean,
): Pick<
  UseQueryOptions<Wallet>,
  | "queryKey"
  | "queryFn"
  | "enabled"
  | "refetchInterval"
  | "refetchOnWindowFocus"
  | "staleTime"
  | "retry"
> {
  return {
    queryKey: qk.wallet(linked),
    queryFn: fetchWallet,
    enabled: linked,
    refetchInterval: WALLET_POLL_MS,
    // staleTime is what stops a return to the tab costing a request: this page
    // used to reload in full on every window focus event, which fires for an
    // alt-tab or a dialog closing, not just a real return.
    refetchOnWindowFocus: true,
    staleTime: WALLET_POLL_MS,
    // A failure is surfaced to the operator, and the next tick retries.
    retry: false,
  };
}
