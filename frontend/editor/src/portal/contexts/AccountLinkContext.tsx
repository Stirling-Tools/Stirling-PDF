import { createContext, useContext, type ReactNode } from "react";
import {
  useAccountLink,
  type UseAccountLink,
} from "@portal/hooks/useAccountLink";

/**
 * Single app-wide {@link useAccountLink} instance, so status is fetched once on
 * mount rather than per consumer.
 *
 * Consumers (the Settings account-link panel, the link card) read this shared
 * instance instead of calling the hook again. Linking itself is not orchestrated
 * here: it is a browser-mediated handshake finished at /account-link/callback.
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
