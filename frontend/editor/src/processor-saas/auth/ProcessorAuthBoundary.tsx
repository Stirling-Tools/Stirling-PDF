import { useEffect, type ReactNode } from "react";
import { AuthProvider } from "@app/auth";
import { useAuth } from "@app/auth/context";
import { Spinner } from "@app/ui";
import { withBasePath } from "@app/constants/app";
import { ensureSaasSupabase } from "@processor/auth/saasSupabase";
import { EDITOR_URL } from "@processor/auth/editorUrl";

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
 * SaaS processor gate: enter only with backend-granted processor/processor access
 * (`processorAccess`, from /api/v1/auth/me), mirroring self-hosted RequireProcessorAccess.
 * The old "any signed-in account may enter" behaviour let team members without
 * access into the Processor.
 *
 * processorAccess resolves *after* the session does (/me runs once `loading` is
 * already false), so treat "real session, access not yet known" (raw
 * user.processorAccess still undefined, and not admin-by-role) as still-loading
 * rather than bouncing a legitimate user mid-load. Once settled: no session ->
 * login; a guest or a real account without access -> the free editor.
 */
function SaasProcessorGate({ children }: { children: ReactNode }) {
  const { session, loading, isAnonymous, processorAccess, user } = useAuth();

  const accessPending =
    !!session &&
    !isAnonymous &&
    !processorAccess &&
    user?.processorAccess === undefined;
  const settling = loading || accessPending;

  const redirectTo = settling
    ? null
    : !session
      ? withBasePath("/login")
      : isAnonymous || !processorAccess
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
 * SaaS override of the processor auth boundary: authenticate against the SaaS Supabase
 * project (inheriting the editor's session) instead of the self-hosted Spring login.
 */
export function ProcessorAuthBoundary({ children }: { children: ReactNode }) {
  // Configure the shared Supabase client (SaaS project) synchronously here, before
  // the AuthProvider below reads it — a useEffect would run too late for the first
  // render, leaving the provider with a null client. Idempotent; the processor mounts
  // outside the editor's AppProviders but against the SAME project, so a user already
  // signed into the editor is picked up from the persisted session (no second login).
  ensureSaasSupabase();
  return (
    <AuthProvider mode="supabase">
      <SaasProcessorGate>{children}</SaasProcessorGate>
    </AuthProvider>
  );
}
