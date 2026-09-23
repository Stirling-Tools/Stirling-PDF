import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@app/auth";
import { bindAccountLinkSession } from "@app/portal/auth/accountLinkSession";

/** Prevents attended queries and callbacks from running under a previous local user's session. */
export function AccountLinkSessionBoundary({
  children,
}: {
  children: ReactNode;
}) {
  const { user, isAdmin, loading } = useAuth();
  const identity = isAdmin && user?.orgOwner === true ? user.id : null;
  const [bound, setBound] = useState<string | null>();
  useEffect(() => {
    if (loading) return;
    bindAccountLinkSession(identity);
    setBound(identity);
  }, [identity, loading]);
  if (loading || identity !== bound) return null;
  return children;
}
