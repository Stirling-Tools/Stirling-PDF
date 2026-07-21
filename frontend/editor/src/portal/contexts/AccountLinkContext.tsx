import { createContext, useContext, type ReactNode } from "react";
import {
  useAccountLink,
  type UseAccountLink,
} from "@portal/hooks/useAccountLink";

/**
 * Single app-wide {@link useAccountLink} instance. The link flow is orchestrated
 * in exactly one place so that:
 *   - status is fetched once on mount (not per consumer), and
 *   - the SSO-return effect fires once — two instances would both call
 *     {@link UseAccountLink.completeLink} on return and re-register the device
 *     credential, leaving a duplicate linked_instance row.
 *
 * Consumers (the top-level link modal host, the Settings account-link panel,
 * the link card) read this shared instance instead of calling the hook again.
 */
const AccountLinkContext = createContext<UseAccountLink | null>(null);

export function AccountLinkProvider({ children }: { children: ReactNode }) {
  const link = useAccountLink();
  return (
    <AccountLinkContext.Provider value={link}>
      {children}
    </AccountLinkContext.Provider>
  );
}

export function useAccountLinkContext(): UseAccountLink {
  const v = useContext(AccountLinkContext);
  if (!v) {
    throw new Error(
      "useAccountLinkContext must be used inside <AccountLinkProvider>",
    );
  }
  return v;
}
