import { useEffect, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useConnectGate } from "@portal/hooks/useConnectGate";

interface Props {
  children: ReactNode;
  fallback: string;
}

/**
 * At the route, not on the buttons: the pipeline builder is reachable from its list, the Documents
 * queue, the connect flow's next steps and a typed URL, and a guard per entry point is one more to
 * remember each time someone adds a link.
 */
export function ConnectGuardedRoute({ children, fallback }: Props) {
  const { gated, loading, connect } = useConnectGate();

  useEffect(() => {
    if (gated) connect();
  }, [gated, connect]);

  // Unknown is not gated: bouncing first would throw a linked admin off a page they are entitled to.
  if (loading) return null;
  if (gated) return <Navigate to={fallback} replace />;
  return <>{children}</>;
}
