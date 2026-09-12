import type { ReactNode } from "react";
import { AccountLinkProvider } from "@app/portal/contexts/AccountLinkContext";

/** SaaS owns its sign-in globally and does not accept self-hosted link callbacks. */
export function SettingsAccountLinkSession({
  children,
}: {
  children: ReactNode;
}) {
  return <AccountLinkProvider>{children}</AccountLinkProvider>;
}
