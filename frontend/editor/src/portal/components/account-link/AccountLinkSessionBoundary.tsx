import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@app/auth";
import { bindAccountLinkSession } from "@portal/auth/accountLinkSession";

/** Prevents attended queries and callbacks from running under a previous local user's session. */
export function AccountLinkSessionBoundary({
  children,
}: {
  children: ReactNode;
}) {
  const { user, isAdmin } = useAuth();
  const identity = isAdmin ? (user?.id ?? null) : null;
  const [bound, setBound] = useState<string | null>();
  useEffect(() => {
    bindAccountLinkSession(identity);
    setBound(identity);
  }, [identity]);
  if (identity !== bound) return null;
  return children;
}
