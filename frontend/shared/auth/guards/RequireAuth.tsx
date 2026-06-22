/**
 * Gate that renders its children only for an authenticated session. While auth
 * is initialising it renders `loading`; when signed out it renders `fallback`
 * (typically a login screen).
 */
import { type ReactNode } from "react";
import { useAuth } from "@shared/auth/context";

export interface RequireAuthProps {
  children: ReactNode;
  /** Rendered when there is no session (e.g. the login panel). */
  fallback: ReactNode;
  /** Rendered while the session is still resolving. */
  loading?: ReactNode;
}

export function RequireAuth({
  children,
  fallback,
  loading = null,
}: RequireAuthProps) {
  const { session, loading: isLoading } = useAuth();
  if (isLoading) return <>{loading}</>;
  if (!session) return <>{fallback}</>;
  return <>{children}</>;
}
