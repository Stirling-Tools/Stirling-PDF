import { useEffect, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useConnectGate } from "@portal/hooks/useConnectGate";

interface Props {
  children: ReactNode;
  /** Where to send someone who cannot open it yet, e.g. the list this builder belongs to. */
  fallback: string;
}

/**
 * Route-level connect gate: arriving at a page that needs a linked account asks for the connection
 * and returns you to where you came from.
 *
 * <p>At the route rather than on the buttons, because guarding click handlers is whack-a-mole. The
 * pipeline builder alone is reachable from its own list, from the Documents review queue, from the
 * Connect flow's own next-steps, and from anyone typing the URL. A guard on each of those is a
 * guard we have to remember every time a new link is added; a guard on the route is one that cannot
 * be walked around.
 *
 * <p>It redirects rather than rendering a locked page: the ask is a dialog, so the page behind it
 * should be the one the admin already knows.
 */
export function ConnectGuardedRoute({ children, fallback }: Props) {
  const { gated, loading, connect } = useConnectGate();

  useEffect(() => {
    if (gated) connect();
  }, [gated, connect]);

  // Hold while the capability is unknown. Redirecting first would bounce a linked admin off a page
  // they are entitled to, and the answer is cached after the first check.
  if (loading) return null;
  if (gated) return <Navigate to={fallback} replace />;
  return <>{children}</>;
}
