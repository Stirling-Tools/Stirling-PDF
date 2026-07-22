import { useEffect, type ReactNode } from "react";
import { AuthProvider } from "@app/auth";
import { useAuth } from "@app/auth/context";
import { Spinner } from "@app/ui";
import { withBasePath } from "@app/constants/app";
import { ensureSaasSupabase } from "@portal/auth/saasSupabase";
import { EDITOR_URL } from "@portal/auth/editorUrl";

function FullScreen({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </div>
  );
}

/**
 * SaaS portal gate: enter only with backend-granted portal/processor access
 * (`portalAccess`, from /api/v1/auth/me), mirroring self-hosted RequirePortalAccess.
 * The old "any signed-in account may enter" behaviour let team members without
 * access into the Processor.
 *
 * portalAccess resolves *after* the session does (/me runs once `loading` is
 * already false), so treat "real session, access not yet known" (raw
 * user.portalAccess still undefined, and not admin-by-role) as still-loading
 * rather than bouncing a legitimate user mid-load. Once settled: no session ->
 * login; a guest or a real account without access -> the free editor.
 */
function SaasPortalGate({ children }: { children: ReactNode }) {
  const { session, loading, isAnonymous, portalAccess, user } = useAuth();

  const accessPending =
    !!session &&
    !isAnonymous &&
    !portalAccess &&
    user?.portalAccess === undefined;
  const settling = loading || accessPending;

  const redirectTo = settling
    ? null
    : !session
      ? withBasePath("/login")
      : isAnonymous || !portalAccess
        ? EDITOR_URL
        : null;

  useEffect(() => {
    if (redirectTo) window.location.href = redirectTo;
  }, [redirectTo]);

  if (settling || redirectTo) {
    return (
      <FullScreen>
        <Spinner size="lg" />
      </FullScreen>
    );
  }
  return <>{children}</>;
}

/**
 * SaaS override of the portal auth boundary: authenticate against the SaaS Supabase
 * project (inheriting the editor's session) instead of the self-hosted Spring login.
 */
export function PortalAuthBoundary({ children }: { children: ReactNode }) {
  // Configure the shared Supabase client (SaaS project) synchronously here, before
  // the AuthProvider below reads it — a useEffect would run too late for the first
  // render, leaving the provider with a null client. Idempotent; the portal mounts
  // outside the editor's AppProviders but against the SAME project, so a user already
  // signed into the editor is picked up from the persisted session (no second login).
  ensureSaasSupabase();
  return (
    <AuthProvider mode="supabase">
      <SaasPortalGate>{children}</SaasPortalGate>
    </AuthProvider>
  );
}
