// Renders children only for a user with portal access; otherwise calls onForbidden.
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@shared/auth/context";

export interface RequirePortalAccessProps {
  children: ReactNode;
  /** Rendered when there is no session (e.g. the login panel). */
  fallback: ReactNode;
  /** Invoked once when an authenticated user without portal access is detected. */
  onForbidden: () => void;
  /** Rendered while the session is still resolving. */
  loading?: ReactNode;
  /** Rendered for an authenticated user without portal access. */
  forbidden?: ReactNode;
}

export function RequirePortalAccess({
  children,
  fallback,
  onForbidden,
  loading = null,
  forbidden = null,
}: RequirePortalAccessProps) {
  const { session, loading: isLoading, portalAccess } = useAuth();

  const shouldRedirect = !isLoading && !!session && !portalAccess;
  useEffect(() => {
    if (shouldRedirect) onForbidden();
  }, [shouldRedirect, onForbidden]);

  if (isLoading) return <>{loading}</>;
  if (!session) return <>{fallback}</>;
  if (!portalAccess) return <>{forbidden}</>;
  return <>{children}</>;
}
