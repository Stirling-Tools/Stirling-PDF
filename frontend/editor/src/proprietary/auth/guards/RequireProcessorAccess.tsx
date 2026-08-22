// Renders children only for a user with processor access; otherwise calls onForbidden.
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@app/auth/context";

export interface RequireProcessorAccessProps {
  children: ReactNode;
  /** Rendered when there is no session (e.g. the login panel). */
  fallback: ReactNode;
  /** Invoked once when an authenticated user without processor access is detected. */
  onForbidden: () => void;
  /** Rendered while the session is still resolving. */
  loading?: ReactNode;
  /** Rendered for an authenticated user without processor access. */
  forbidden?: ReactNode;
}

export function RequireProcessorAccess({
  children,
  fallback,
  onForbidden,
  loading = null,
  forbidden = null,
}: RequireProcessorAccessProps) {
  const { session, loading: isLoading, processorAccess } = useAuth();

  const shouldRedirect = !isLoading && !!session && !processorAccess;
  useEffect(() => {
    if (shouldRedirect) onForbidden();
  }, [shouldRedirect, onForbidden]);

  if (isLoading) return <>{loading}</>;
  if (!session) return <>{fallback}</>;
  if (!processorAccess) return <>{forbidden}</>;
  return <>{children}</>;
}
