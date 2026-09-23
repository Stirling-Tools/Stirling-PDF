import type { LegacyBillingState } from "@app/types/legacyBilling";

const empty: LegacyBillingState = {
  subscriptions: [],
  loading: false,
  loadError: false,
  opening: false,
  portalError: false,
  refresh: () => {},
  openPortal: async () => {},
};

/** SaaS shadows this hook to expose the signed-in owner's historical billing. */
export function useLegacySubscriptions(): LegacyBillingState {
  return empty;
}
