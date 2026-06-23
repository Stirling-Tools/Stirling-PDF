/**
 * Gate that renders its children only for an authenticated admin.
 *
 * - Still loading -> `loading`
 * - Signed out -> `fallback` (login screen)
 * - Signed in but not admin -> calls `onForbidden` (e.g. redirect to the
 *   editor) and renders `forbidden` in the meantime
 */
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@shared/auth/context";

export interface RequireAdminProps {
  children: ReactNode;
  /** Rendered when there is no session (e.g. the login panel). */
  fallback: ReactNode;
  /** Invoked once when an authenticated non-admin is detected. */
  onForbidden: () => void;
  /** Rendered while the session is still resolving. */
  loading?: ReactNode;
  /** Rendered for an authenticated non-admin (while `onForbidden` runs). */
  forbidden?: ReactNode;
}

export function RequireAdmin({
  children,
  fallback,
  onForbidden,
  loading = null,
  forbidden = null,
}: RequireAdminProps) {
  const { session, loading: isLoading, isAdmin } = useAuth();

  const shouldRedirect = !isLoading && !!session && !isAdmin;
  useEffect(() => {
    if (shouldRedirect) onForbidden();
  }, [shouldRedirect, onForbidden]);

  if (isLoading) return <>{loading}</>;
  if (!session) return <>{fallback}</>;
  if (!isAdmin) return <>{forbidden}</>;
  return <>{children}</>;
}
